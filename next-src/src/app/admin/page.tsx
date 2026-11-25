import { AdminConsole } from '@/components/AdminConsole';
export const metadata = {title:'Administration — ValueArena',robots:{index:false,follow:false}};
export default function AdminPage(){return <div className="research-index evaluation-page"><header className="research-page-head"><h1>Administration</h1><p>Manage participant access, execution credits, and evaluation settings.</p></header><AdminConsole/></div>;}
