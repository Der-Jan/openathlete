type AccountDeletingPayload = {
  userId: number;
  athleteId?: number;
};

/**
 * Emitted, and awaited, before an account is erased, while its provider
 * tokens still exist: providers that keep sending a user's data until told
 * otherwise (Garmin) are told here.
 */
export class AccountDeletingEvent {
  static readonly SLUG = 'account.deleting';

  constructor(public readonly payload: AccountDeletingPayload) {}
}
