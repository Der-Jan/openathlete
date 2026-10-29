import axios, { isAxiosError } from 'axios';

import { Injectable, Logger } from '@nestjs/common';

import { ConnectorProvider, MetricType } from '@openathlete/database';
import { mapPrismaWorkoutToDto } from '@openathlete/shared';

import { PrismaService } from '../../prisma/services/prisma.service';
import { createSuuntoGuideZip } from '../mapping/suunto-guide-zip';
import type { SuuntoMetrics, SuuntoZone } from '../mapping/suunto-guide.mapper';
import { mapWorkoutDtoToSuuntoGuide } from '../mapping/suunto-guide.mapper';
import type {
  SuuntoGuideListResponse,
  SuuntoGuideResponse,
} from '../mapping/suunto-guide.types';
import type {
  DeletePlannedWorkoutInput,
  ProviderAdapter,
  UpsertPlannedWorkoutInput,
  UpsertPlannedWorkoutResult,
} from '../provider-adapter.interface';
import { SuuntoProviderService } from '../providers/suunto.provider.service';

const GUIDES_API_BASE_URL = 'https://cloudapi.suunto.com/v2/guides';

/** Metrics that percentage targets refer to */
const REFERENCE_METRICS: MetricType[] = [
  MetricType.VMA,
  MetricType.FTP_RUNNING,
  MetricType.FTP_CYCLING,
  MetricType.CRITICAL_POWER_RUNNING,
  MetricType.CRITICAL_POWER_CYCLING,
  MetricType.HR_MAX,
  MetricType.HR_REST,
  MetricType.HR_RESERVE,
];

@Injectable()
export class SuuntoAdapter implements ProviderAdapter {
  private readonly logger = new Logger(SuuntoAdapter.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suuntoProviderService: SuuntoProviderService,
  ) {}

  getProvider(): 'suunto' {
    return 'suunto';
  }

  private async getMetrics(athleteId: number): Promise<SuuntoMetrics> {
    const metrics = await this.prisma.athleteMetric.findMany({
      where: { athleteId, type: { in: REFERENCE_METRICS } },
      orderBy: [{ type: 'asc' }, { date: 'desc' }],
      distinct: ['type'],
      select: { type: true, value: true },
    });
    return Object.fromEntries(
      metrics.map((metric) => [metric.type, { value: metric.value }]),
    );
  }

  private async getZones(athleteId: number): Promise<SuuntoZone[]> {
    const zones = await this.prisma.trainingZone.findMany({
      where: { athleteId },
      select: {
        trainingZoneId: true,
        type: true,
        values: { select: { min: true, max: true, sports: true } },
      },
    });
    return zones as SuuntoZone[];
  }

  async upsertPlannedWorkout(
    input: UpsertPlannedWorkoutInput,
  ): Promise<UpsertPlannedWorkoutResult> {
    const account = await this.prisma.providerAccount.findFirst({
      where: {
        athleteId: input.athleteId,
        provider: ConnectorProvider.SUUNTO,
        status: 'active',
      },
    });

    if (!account) {
      throw new Error('No active Suunto account found for athlete');
    }

    // Fetch workout with full structure (including repeat blocks)
    // This preserves the repeat structure for proper Suunto RepeatStep mapping
    const workoutRecord = await this.prisma.workout.findUnique({
      where: { workoutId: input.workoutId },
      include: {
        steps: {
          include: {
            targets: true,
            repeatBlock: {
              include: {
                childSteps: {
                  include: {
                    targets: true,
                  },
                  orderBy: { orderIndex: 'asc' },
                },
              },
            },
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!workoutRecord) {
      throw new Error('Workout not found');
    }

    const [metrics, zones] = await Promise.all([
      this.getMetrics(input.athleteId),
      this.getZones(input.athleteId),
    ]);

    // Convert to DTO format
    const workoutDto = mapPrismaWorkoutToDto(workoutRecord);

    // Map workout to Suunto Guide format (preserving repeat structure)
    const guide = mapWorkoutDtoToSuuntoGuide(
      workoutDto,
      input.normalized.sport,
      input.normalized.title ?? null,
      input.normalized.description ?? null,
      input.date,
      input.workoutId,
      { metrics, zones },
    );

    if (guide.steps.length === 0) {
      throw new Error('Workout has no steps to send to Suunto');
    }

    const zipBuffer = createSuuntoGuideZip(guide);
    const guideId = await this.suuntoProviderService.makeGuidesApiRequest(
      account,
      (accessToken) =>
        this.saveGuide(
          accessToken,
          zipBuffer,
          guide.externalId!,
          input.previousExternalId,
        ),
    );
    this.logger.debug(
      `Saved Suunto guide ${guideId} for account ${account.providerAccountId}`,
    );

    return { externalId: guideId };
  }

  private async saveGuide(
    accessToken: string,
    zipBuffer: Buffer,
    externalId: string,
    previousId?: string,
  ): Promise<string> {
    if (previousId) {
      try {
        return await this.sendGuide(accessToken, zipBuffer, previousId);
      } catch (error) {
        // Deleted in the Suunto app meanwhile: create it again
        if (!isAxiosError(error) || error.response?.status !== 404) {
          throw this.guideError(error);
        }
      }
    }
    try {
      return await this.sendGuide(accessToken, zipBuffer);
    } catch (error) {
      // The guide exists but its id was lost, e.g. by a deletion that
      // failed: update it, else every export of the session fails
      if (isAxiosError(error) && error.response?.status === 409) {
        const existingId = await this.findGuideId(accessToken, externalId);
        if (existingId) {
          return this.sendGuide(accessToken, zipBuffer, existingId).catch(
            (retryError: unknown) => {
              throw this.guideError(retryError);
            },
          );
        }
      }
      throw this.guideError(error);
    }
  }

  /** Create a guide, or replace the one with this id */
  private async sendGuide(
    accessToken: string,
    zipBuffer: Buffer,
    guideId?: string,
  ): Promise<string> {
    const headers = {
      ...this.suuntoProviderService.getGuidesApiHeaders(accessToken),
      'Content-Type': 'application/zip',
    };
    const options = {
      headers,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    };
    const { data } = guideId
      ? await axios.put<SuuntoGuideResponse>(
          `${GUIDES_API_BASE_URL}/files/${encodeURIComponent(guideId)}`,
          zipBuffer,
          options,
        )
      : await axios.post<SuuntoGuideResponse>(
          `${GUIDES_API_BASE_URL}/files`,
          zipBuffer,
          options,
        );
    if (data.error) {
      throw new Error(
        `Suunto Guides API error: ${data.error.description || data.error.code}`,
      );
    }
    if (!data.payload?.id) {
      throw new Error('Suunto Guides API returned no guide ID');
    }
    return data.payload.id;
  }

  private async findGuideId(
    accessToken: string,
    externalId: string,
  ): Promise<string | null> {
    const { data } = await axios.get<SuuntoGuideListResponse>(
      `${GUIDES_API_BASE_URL}/items`,
      { headers: this.suuntoProviderService.getGuidesApiHeaders(accessToken) },
    );
    return (
      data.payload?.find((item) => item.externalId === externalId)?.id ?? null
    );
  }

  /** Keep Suunto's reason, such as an invalid step, in the export's error */
  private guideError(error: unknown): unknown {
    if (!isAxiosError(error) || error.response?.status === 401) return error;
    const data = error.response?.data as SuuntoGuideResponse | undefined;
    const reason = data?.error?.description || data?.error?.code;
    this.logger.error(
      `Suunto Guides API request failed: ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
    );
    return reason ? new Error(`Suunto refused the guide: ${reason}`) : error;
  }

  async deletePlannedWorkout(input: DeletePlannedWorkoutInput): Promise<void> {
    if (!input.externalId) {
      this.logger.debug(
        `No external ID provided for deletion, skipping for athlete ${input.athleteId}`,
      );
      return;
    }

    const account = await this.prisma.providerAccount.findFirst({
      where: {
        athleteId: input.athleteId,
        provider: ConnectorProvider.SUUNTO,
        status: 'active',
      },
    });

    if (!account) {
      this.logger.warn(
        `No active Suunto account found for athlete ${input.athleteId}, skipping deletion`,
      );
      return;
    }

    await this.suuntoProviderService.makeGuidesApiRequest(
      account,
      async (accessToken: string) => {
        try {
          const headers =
            this.suuntoProviderService.getGuidesApiHeaders(accessToken);

          await axios.delete(
            `${GUIDES_API_BASE_URL}/files/${input.externalId}`,
            {
              headers,
            },
          );

          this.logger.debug(
            `Deleted Suunto guide ${input.externalId} for account ${account.providerAccountId}`,
          );
        } catch (error) {
          if (isAxiosError(error)) {
            // If guide not found, that's okay - it's already deleted
            if (error.response?.status === 404) {
              this.logger.debug(
                `Guide ${input.externalId} not found, already deleted`,
              );
              return;
            }

            this.logger.error(
              `Failed to delete Suunto guide ${input.externalId}: ${error.response?.status} ${error.response?.statusText} - ${JSON.stringify(error.response?.data)}`,
            );
          }
          throw error;
        }
      },
    );
  }
}
