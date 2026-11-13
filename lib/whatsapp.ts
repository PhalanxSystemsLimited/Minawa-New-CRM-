// WhatsApp is sent by hand: staff open each owner's chat (WhatsApp Web or the app) from Send on WhatsApp with the
// message typed in, and confirm it was sent. There is no automatic sending (no Meta WhatsApp Business API).
import { waDigits } from './fmt';

/** While testing: every chat opens with this number instead of the owner's (WHATSAPP_TEST_NUMBER). Remove it to go live. */
export const waTestNumber = () => waDigits(process.env.WHATSAPP_TEST_NUMBER || '');
