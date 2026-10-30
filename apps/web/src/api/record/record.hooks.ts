import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { GetRecordsQueryDto } from '@openathlete/shared';

import { RecordAPI } from './record.api';
import { recordKeys } from './record.keys';

export const useGetRecordsQuery = (
  query: GetRecordsQueryDto,
  {
    enabled = true,
    keepPrevious = false,
  }: { enabled?: boolean; keepPrevious?: boolean } = {},
) =>
  useQuery({
    queryFn: () => RecordAPI.getRecords(query),
    queryKey: [
      recordKeys.getRecords,
      query.sport,
      query.athleteId,
      query.from?.toISOString(),
      query.to?.toISOString(),
    ],
    enabled,
    ...(keepPrevious && { placeholderData: keepPreviousData }),
  });

export const useGetRecordSportsQuery = (athleteId?: number) =>
  useQuery({
    queryFn: () => RecordAPI.getRecordSports(athleteId),
    queryKey: [recordKeys.getRecordSports, athleteId],
  });
