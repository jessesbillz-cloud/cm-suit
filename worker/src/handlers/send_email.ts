// send_email: in Phase 0 emails are sent by edge functions (Resend), not the worker.
export function sendEmail(): Promise<void> {
  return Promise.reject(new Error('emails are sent by edge functions in Phase 0'));
}
