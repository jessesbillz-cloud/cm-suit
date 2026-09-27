// sort_inbound_email: Phase 0 only receives, stores and quarantines inbound mail. Sorting arrives in Phase 1.
export function sortInboundEmail(): Promise<void> {
  return Promise.reject(new Error('sort_inbound_email is not implemented until Phase 1'));
}
