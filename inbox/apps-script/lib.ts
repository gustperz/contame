/**
 * What the Apps Script mailbox needs from the shared code, bundled into one
 * global (ContameMailbox) because Apps Script has no modules.
 */
export { emailFromGmail } from "../src/gmail";
export { prepareDelivery, refusal } from "../src/receiver";
