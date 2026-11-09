import { Chat } from '@/components/Chat';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata('Compare responses | ValueArena', 'Ask two models the same question and compare their responses.', '/responses/');
export default function ResponsesPage() { return <Chat />; }
