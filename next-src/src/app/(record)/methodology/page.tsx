// Server component — KaTeX is rendered at build time so we don't ship the
// 200kB katex runtime to clients. The katex.min.css is loaded once via the
// layout-level <link>.

import { renderTex } from '@/lib/katex-server';

export const metadata = {
  title: 'ValueArena — Methodology',
};

export default function MethodologyPage() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"
      />

      <article className="m-shell">
        <header className="pt-8 pb-6 border-b border-border-light">
          <div className="text-text-muted text-xs uppercase tracking-widest mb-2">Lab Notes · v1</div>
          <h1 className="font-serif text-4xl mb-4">
            How <em>ValueArena</em> measures character.
          </h1>
          <p className="text-text-muted text-base max-w-3xl">
            A full walk-through of the pipeline: how judgments are collected, how skills are fit
            with Bradley–Terry–Davidson, how uncertainty is quantified via non-parametric bootstrap,
            how judge trust is aggregated with EigenTrust, and how the final Elo numbers are pegged
            to a fixed anchor across constitutions.
          </p>
          <div className="mt-4 text-xs text-text-muted space-x-4">
            <span>
              <strong>Last updated</strong> 2026-04-17
            </span>
            <span>
              <strong>Code</strong> <code>invi-bhagyesh/EigenBench</code>
            </span>
            <span>
              <strong>Data</strong> <code>invi-bhagyesh/ValueArena</code>
            </span>
          </div>
        </header>

        <Section num="01" id="overview" title="Pipeline overview">
          <p>
            Every ValueArena run starts with a <strong>spec</strong>: a constitution, a set of
            models, and a slice of scenarios. The spec drives five stages — collection, BTD fitting,
            bootstrap, EigenTrust, and upload — producing a single published row on the leaderboard.
          </p>
          <p>
            Each stage is deterministic given its inputs, so a run can be re-played from the raw
            judgments without re-querying any model. The artifacts on HuggingFace (
            <code>meta.json</code>, <code>summary.json</code>, <code>evaluations.jsonl</code>) are
            sufficient to reproduce every number on the site.
          </p>
        </Section>

        <Section num="02" id="constitutions" title="Constitutions & scenarios">
          <p>
            A <strong>constitution</strong> is a short document — typically 3–7 numbered criteria
            written in the second person — that defines the trait under evaluation (
            <em>goodness</em>, <em>sarcasm</em>, <em>misalignment</em>, and so on). Criteria are
            operational: each one names an observable behavior a judge can check against a
            transcript.
          </p>
          <p>
            A <strong>scenario</strong> is a prompt that elicits behavior relevant to the
            constitution. The scenario set is fixed across all runs of the same constitution, so
            Elo comparisons across models are always over matched prompt distributions.
          </p>
        </Section>

        <Section num="03" id="collection" title="Collection: pairwise judgments">
          <p>
            For each scenario <InlineEq tex="s" /> and each ordered pair of contestants{' '}
            <InlineEq tex="(i, j)" />, a judge <InlineEq tex="k" /> is sampled from the judge pool.
            The judge reads the constitution, the scenario, and the two anonymized responses, and
            returns one of <code>{'{i wins, j wins, tie}'}</code>. Results are appended to{' '}
            <code>evaluations.jsonl</code> — one JSON line per judgment.
          </p>
          <p>Two sampler modes are supported:</p>
          <dl className="my-3 space-y-2">
            <div>
              <dt className="font-mono inline">btd_d2</dt>
              <dd className="inline ml-2 text-text-muted">
                Round-robin at scenario level, diameter-2 contestant graph — every model plays every
                other on every scenario. Used for small pools (≤8 contestants).
              </dd>
            </div>
            <div>
              <dt className="font-mono inline">uniform</dt>
              <dd className="inline ml-2 text-text-muted">
                Uniform random triads subject to a target games-per-model budget. Used for larger
                pools where full round-robin would be prohibitive.
              </dd>
            </div>
          </dl>
          <p>
            The raw judgment tensor <InlineEq tex="W \in \mathbb{N}^{M \times M \times K}" /> counts,
            for each contestant pair and each judge, the number of wins of row over column. Ties
            contribute <InlineEq tex="\tfrac{1}{2}" /> to both <InlineEq tex="W_{ij}" /> and{' '}
            <InlineEq tex="W_{ji}" /> when passed to the simple BTD fit; the full Davidson variant
            (§04) treats them as their own outcome.
          </p>
        </Section>

        <Section num="04" id="btd" title="Bradley–Terry–Davidson">
          <p>
            Given a strength parameter <InlineEq tex="\beta_i" /> per contestant, the{' '}
            <strong>Bradley–Terry</strong> model says the probability that <InlineEq tex="i" />{' '}
            beats <InlineEq tex="j" /> on a single trial is
          </p>
          <BlockEq tex="P(i \succ j) = \sigma(\beta_i - \beta_j) = \frac{1}{1 + e^{-(\beta_i - \beta_j)}}" />
          <p>
            <strong>Davidson&apos;s extension</strong> adds a tie parameter{' '}
            <InlineEq tex="\nu \ge 0" /> (a nuisance parameter shared across pairs). Under
            Davidson, the three-way likelihood on a single pair is
          </p>
          <BlockEq tex={`\\begin{aligned}
P(i \\succ j) &= \\frac{e^{\\beta_i}}{e^{\\beta_i} + e^{\\beta_j} + \\nu \\sqrt{e^{\\beta_i + \\beta_j}}} \\\\
P(j \\succ i) &= \\frac{e^{\\beta_j}}{e^{\\beta_i} + e^{\\beta_j} + \\nu \\sqrt{e^{\\beta_i + \\beta_j}}} \\\\
P(\\text{tie}) &= \\frac{\\nu \\sqrt{e^{\\beta_i + \\beta_j}}}{e^{\\beta_i} + e^{\\beta_j} + \\nu \\sqrt{e^{\\beta_i + \\beta_j}}}
\\end{aligned}`} />
          <p>
            We fit <InlineEq tex="\boldsymbol{\beta}, \nu" /> by maximizing the total
            log-likelihood over all judgments, with an <InlineEq tex="\ell_2" /> regularizer on{' '}
            <InlineEq tex="\boldsymbol{\beta}" /> to pin down the global shift (the model is
            translation-invariant) and stabilize the fit when a contestant has very lopsided
            results. Optimization uses L-BFGS; convergence is reached in a few dozen iterations.
          </p>
        </Section>

        <Section num="05" id="bootstrap" title="Bootstrap intervals">
          <p>
            Point estimates of <InlineEq tex="\boldsymbol{\beta}" /> are noisy — a single lucky win
            on a small scenario set can shift an Elo by tens of points. To report{' '}
            <strong>95% CIs</strong> we use a non-parametric bootstrap at the <em>judgment</em>{' '}
            level: resample the rows of <code>evaluations.jsonl</code> with replacement, refit BTD,
            and collect the resulting <InlineEq tex="\boldsymbol{\beta}^{(b)}" /> for{' '}
            <InlineEq tex="b = 1, \dots, B = 1000" />.
          </p>
          <BlockEq tex="\mathrm{CI}_{95}(\beta_i) = \left[ q_{0.025}\!\left(\{\beta_i^{(b)}\}_b\right),\; q_{0.975}\!\left(\{\beta_i^{(b)}\}_b\right) \right]" />
          <p>
            The <code>summary.json</code> stored on HuggingFace records the <em>mean</em> (not the
            point MLE) and the two empirical quantiles per model. Using the bootstrap mean keeps
            consistency with the CI calculation and absorbs a small amount of non-identifiability
            at the boundary (models with 0% or 100% win rates).
          </p>
        </Section>

        <Section num="06" id="eigentrust" title="EigenTrust">
          <p>
            Not every judge is equally reliable. A weak or sycophantic model can pollute the win
            counts, biasing <InlineEq tex="\boldsymbol{\beta}" />. Rather than hand-select judges,
            we let the judges <em>vote on each other</em> and solve for the stationary trust
            distribution — the classic{' '}
            <a
              className="link-subtle"
              href="https://nlp.stanford.edu/pubs/eigentrust.pdf"
              target="_blank"
              rel="noopener"
            >
              EigenTrust
            </a>{' '}
            setup adapted to the arena.
          </p>
          <p>
            Let <InlineEq tex="C \in \mathbb{R}^{K \times K}" /> be the row-stochastic matrix where{' '}
            <InlineEq tex="C_{kl}" /> is the fraction of times judge <InlineEq tex="k" /> agrees
            with the BTD-implied ordering when judge <InlineEq tex="l" /> would have disagreed with
            them. The trust vector <InlineEq tex="\mathbf{t}" /> is the stationary distribution of
            the damped chain
          </p>
          <BlockEq tex="\mathbf{t}^{(n+1)} = (1 - a) C^\top \mathbf{t}^{(n)} + a \, \mathbf{p}" />
          <p>
            where <InlineEq tex="\mathbf{p}" /> is a uniform prior over judges and{' '}
            <InlineEq tex="a = 0.1" /> is the teleport probability. Iteration converges in under 50
            steps. Final trust scores are stored per judge in <code>meta.json</code> and shown on
            the leaderboard hover cards.
          </p>
        </Section>

        <Section num="07" id="pegging" title="Elo pegging across constitutions">
          <p>
            BTD strengths live on an arbitrary log-odds scale — they&apos;re only identified up to
            a shift. For display we transform to Elo:
          </p>
          <BlockEq tex="E_i = 1500 + \frac{400}{\ln 10} \cdot \beta_i + c" />
          <p>
            The constant <InlineEq tex="c" /> is what <em>pegging</em> chooses. Three reference
            models — <code>gpt-4o</code>, <code>claude-4-sonnet</code>, <code>gemini-2.5-pro</code>{' '}
            — are scored in every run, and <InlineEq tex="c" /> is set so that their mean Elo
            equals 1500 within that run:
          </p>
          <BlockEq tex="c = 1500 - \frac{1}{|R|} \sum_{r \in R} \left(1500 + \frac{400}{\ln 10}\,\beta_r\right) = -\frac{400}{\ln 10} \cdot \bar{\beta}_R" />
          <p>
            where <InlineEq tex="R" /> is the set of reference models present in the run.
          </p>
        </Section>

        <Section num="08" id="workflow" title="Compute workflow">
          <p>
            Collection, BTD fitting, and bootstrap are all CPU-bound; only model inference needs a
            GPU. Two paths exist, and we use the second for anything beyond single-spec experiments.
          </p>
          <pre className="prompt-block">
            {`# train all 11 openchar runs locally in 3 parallel workers,
# then upload one constitution at a time
.venv/bin/python scripts/run_local_train_upload.py \\
    --group openchar \\
    --parallel 3`}
          </pre>
        </Section>

        <Section num="09" id="limits" title="Limits & caveats">
          <p>
            <strong>Judges are not neutral.</strong> Using frontier LLMs as judges imports their
            preferences. EigenTrust mitigates this somewhat — unreliable judges get down-weighted —
            but systematic agreement across the pool still shows up as &ldquo;truth&rdquo;.
          </p>
          <p>
            <strong>Anchors may drift between constitutions.</strong> <code>gpt-4o</code> is not
            equally &ldquo;average&rdquo; on <em>goodness</em> and on <em>misalignment</em>.
            Pegging to the mean of three refs controls some of this, but cross-trait comparisons
            should be read as directional, not absolute.
          </p>
          <p>
            <strong>Bootstrap is judgment-level, not scenario-level.</strong> If a single scenario
            happens to favor one model, resampling judgments won&apos;t erase it — only resampling
            scenarios would. For small scenario counts, CIs are therefore narrower than the true
            epistemic uncertainty.
          </p>
          <p>
            <strong>Finite-sample BTD bias.</strong> When a contestant wins or loses every game,
            the MLE diverges; the ridge penalty pulls such strengths toward zero but not to any{' '}
            <em>principled</em> value. Ties (via the Davidson parameter) help, but rare.
          </p>
          <p>
            <strong>Trait orthogonality is not enforced.</strong> Constitutions were written
            independently, and some traits correlate (e.g. <em>loving</em> and <em>goodness</em>{' '}
            tend to move together in our runs). The cross-constitution Pareto on the leaderboard
            visualizes this.
          </p>
        </Section>
      </article>
    </>
  );
}

function Section({
  num,
  id,
  title,
  children,
}: {
  num: string;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-10 border-b border-border-light">
      <div className="flex items-baseline gap-3 mb-4">
        <div className="font-mono text-xs text-text-muted">{num}</div>
        <h2 className="font-serif text-2xl">{title}</h2>
      </div>
      <div className="prose-like space-y-4 text-[0.95rem] leading-relaxed">{children}</div>
    </section>
  );
}

function InlineEq({ tex }: { tex: string }) {
  return <span dangerouslySetInnerHTML={{ __html: renderTex(tex, false) }} />;
}

function BlockEq({ tex }: { tex: string }) {
  return (
    <div
      className="my-4 text-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: renderTex(tex, true) }}
    />
  );
}
