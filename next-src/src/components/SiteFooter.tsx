import { papers } from '@/lib/papers';
import { PixelHills } from './PixelHills';

// Site-wide footer: link cards over a pixel landscape, with the wordmark
// standing on the hills and cropped by the bottom edge.
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="site-footer-panel">
        <div className="site-footer-cards">
          <nav className="site-footer-card" aria-label="Research">
            <h2>Research</h2>
            <ul>
              {papers.map((p) => (
                <li key={p.slug}>
                  <a href={`/research/${p.slug}/`}>{p.title}</a>
                </li>
              ))}
              <li>
                <a href="/research/">All papers</a>
              </li>
            </ul>
          </nav>
          <nav className="site-footer-card" aria-label="Results">
            <h2>Results</h2>
            <ul>
              <li><a href="/leaderboard/">Leaderboard</a></li>
              <li><a href="/explore/">Explore</a></li>
              <li><a href="/experiments/">Experiments</a></li>
              <li><a href="/compare/">Compare models</a></li>
            </ul>
          </nav>
          <nav className="site-footer-card" aria-label="Open source">
            <h2>Open</h2>
            <ul>
              <li><a href="https://github.com/ValueArena/ValueArena.github.io">Site code ↗</a></li>
              <li><a href="https://github.com/jchang153/EigenBench">EigenBench ↗</a></li>
              <li><a href="https://huggingface.co/datasets/invi-bhagyesh/ValueArena">Dataset ↗</a></li>
            </ul>
          </nav>
          <div className="site-footer-card site-footer-cta">
            <div>
              <p>Run EigenBench on your own models and constitutions.</p>
              <a className="site-footer-button" href="/evaluate/">
                Start an evaluation <span aria-hidden>→</span>
              </a>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/art/laisr-pixel-mark.webp" width="56" height="56" alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-footer-meta">
          <a href="/lab/">© {year} LAISR Lab, Cornell University</a>
          <a href="https://arxiv.org/abs/2509.01938">EigenBench paper ↗</a>
        </div>
        <div className="site-footer-scene" aria-hidden="true">
          <PixelHills variant="footer" />
          <span className="site-footer-wordmark">ValueArena</span>
        </div>
      </div>
    </footer>
  );
}
