import { Language } from 'src/common/constants/languages.constant';

import { trainingReminderNotification } from './training-reminder';
import { getPushNotificationTranslation } from './translations';

describe('push notification translations', () => {
  it('writes activity feedback in Brazilian Portuguese', () => {
    expect(
      getPushNotificationTranslation('activity_processed', Language.PT_BR, {
        hasQuestions: true,
      }),
    ).toEqual({
      title: 'Atividade processada',
      body: 'Sua atividade foi analisada e as perguntas de feedback já estão disponíveis.',
    });
  });

  it('writes the next-day reminder in Brazilian Portuguese', () => {
    expect(trainingReminderNotification(Language.PT_BR, ['Corrida'])).toEqual({
      title: 'Amanhã',
      body: 'Corrida',
    });
    expect(
      trainingReminderNotification(Language.PT_BR, ['Corrida', 'Natação']),
    ).toEqual({
      title: 'Amanhã',
      body: '2 sessões: Corrida, Natação',
    });
  });
});
