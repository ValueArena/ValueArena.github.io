import { SiteRedirect } from '@/components/SiteRedirect';
export const metadata = { title: 'EigenBench', robots: { index: false, follow: true } };
export default function Page() { return <SiteRedirect to="https://eigenbench.github.io/evaluation/" label="EigenBench" />; }
