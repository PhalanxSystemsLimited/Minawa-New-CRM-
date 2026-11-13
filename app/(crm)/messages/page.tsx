// "WhatsApp messages" is now part of WhatsApp (/whatsapp): this address still works.
import { redirect } from 'next/navigation';
export default function AllMessages() { redirect('/whatsapp?view=projects'); }
