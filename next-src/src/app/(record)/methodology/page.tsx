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
            A full walk-through of the two EigenBench protocols: pairwise comparisons fit with
            Bradley–Terry–Davidson and direct criterion ratings normalized into a trust matrix,
            together with protocol-aware bootstrap uncertainty and EigenTrust aggregation.
          </p>
          <div className="mt-4 text-xs text-text-muted space-x-4">
            <span>
              <strong>Last updated</strong> 2026-08-21
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
            models, and a slice of scenarios. Its <code>evaluation.mode</code> chooses either
            <code>pairwise_btd</code> or <code>direct_rating</code>. Both paths collect judgments,
            construct a row-stochastic trust matrix, quantify uncertainty, run EigenTrust, and
            publish the same leaderboard summary schema.
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

        <Section num="03" id="collection" title="Collection protocols">
          <h3 className="font-serif text-xl">Pairwise comparisons</h3>
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
          <h3 className="font-serif text-xl pt-3">Direct ratings</h3>
          <p>
            In <code>direct_rating</code> mode, judge <InlineEq tex="i" /> directly scores evaluee{' '}
            <InlineEq tex="j" /> on every criterion using an integer scale from 1 to 10.
            Self-ratings are included by default but can be disabled. Before assigning numbers,
            the judge produces a criterion-by-criterion reflection on the response.
          </p>
          <p>
            Direct collection can be exhaustive or partition-sampled. In the partitioned design,
            all <InlineEq tex="N" /> responses for a scenario are randomly divided into groups of
            at most <InlineEq tex="k" />. One seeded random judge rates each group. Repeating this
            for redundancy <InlineEq tex="r" /> gives exactly <InlineEq tex="rNL" /> direct
            judgments across <InlineEq tex="L" /> scenarios, instead of{' '}
            <InlineEq tex="LN^2" /> exhaustive judgments. The default sampled setting is{' '}
            <InlineEq tex="r=1" /> and <InlineEq tex="k=4" />.
          </p>
          <p>
            Ratings are averaged over the observed scenario assignments and criteria to form{' '}
            <InlineEq tex="\bar r_{ij}" />. Let <InlineEq tex="\mathcal O_i" /> be the evaluees
            observed for judge <InlineEq tex="i" />. The default transformation standardizes the
            observed portion of each judge row and applies a masked softmax:
          </p>
          <BlockEq tex="z_{ij} = \frac{\bar r_{ij}-\mu_i}{\sigma_i}, \qquad C_{ij} = \frac{\exp(z_{ij}/\tau)}{\sum_{k \in \mathcal O_i} \exp(z_{ik}/\tau)} \; (j \in \mathcal O_i)" />
          <p>
            This removes each judge&apos;s individual scale and produces a row-stochastic trust matrix
            directly, without fitting Bradley–Terry parameters. Unobserved edges receive zero
            weight. Constant rows safely become uniform over observed edges; a completely absent
            judge row in a bootstrap replicate becomes uniform over structurally eligible evaluees.
          </p>
        </Section>

        <Section num="04" id="btd" title="Pairwise analysis: Bradley–Terry–Davidson">
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
            Bootstrap resampling follows the collection protocol. Pairwise runs resample judgment
            rows and refit BTD. Direct runs use a scenario-cluster bootstrap: scenarios are sampled
            with replacement while all judge–evaluee–criterion ratings for each selected scenario
            remain together. The mean score matrix, row normalization, and EigenTrust vector are
            then recomputed from scratch.
          </p>
          <BlockEq tex="\mathrm{CI}_{95}(E_i) = \left[ q_{0.025}\!\left(\{E_i^{(b)}\}_b\right),\; q_{0.975}\!\left(\{E_i^{(b)}\}_b\right) \right]" />
          <p>
            The <code>summary.json</code> stored on HuggingFace records the bootstrap mean, standard
            deviation, and empirical 2.5% and 97.5% quantiles per model. Bootstrap never makes new
            model API calls; it operates entirely on the saved judgments.
          </p>
        </Section>

        <Section num="06" id="eigentrust" title="EigenTrust">
          <p>
            Not every judge is equally reliable. Rather than hand-select judges, we solve for the
            stationary distribution of the row-stochastic trust matrix using the classic{' '}
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
            In pairwise mode, <InlineEq tex="C" /> is derived from the fitted BTD judge/evaluee
            structure. In direct mode, <InlineEq tex="C_{ij}" /> is the normalized trust assigned
            directly by judge <InlineEq tex="i" /> to evaluee <InlineEq tex="j" />. In both cases,
            the trust vector <InlineEq tex="\mathbf{t}" /> follows the same iteration:
          </p>
          <BlockEq tex="\mathbf{t}^{(n+1)} = (1 - a) C^\top \mathbf{t}^{(n)} + a \, \mathbf{p}" />
          <p>
            where <InlineEq tex="\mathbf{p}" /> is a uniform prior and <InlineEq tex="a" /> is the
            configured teleport probability. Final trust scores are stored in <code>meta.json</code>.
          </p>
        </Section>

        <Section num="07" id="pegging" title="EigenBench Elo scale">
          <p>
            Both protocols transform the final EigenTrust probability <InlineEq tex="t_i" /> to a
            common display scale. Uniform trust maps every model to 1500:
          </p>
          <BlockEq tex="E_i = 1500 + 400\log_{10}(M t_i)" />
          <p>
            This keeps the published summary schema identical across protocols while preserving
            the relative trust ratios within a run. Cross-run comparisons should still account for
            changes in the model and judge populations.
          </p>
        </Section>

        <Section num="08" id="workflow" title="Compute workflow">
          <p>
            Only model inference needs a GPU. BTD fitting, direct trust construction, EigenTrust,
            bootstrap, and upload are CPU-side stages that can be replayed from saved judgments.
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
            <strong>Judge populations may drift between runs.</strong> A score is relative to the
            models participating in that run. Cross-trait and cross-run comparisons should be read
            as directional unless the same model and judge populations are used.
          </p>
          <p>
            <strong>Bootstrap uncertainty depends on protocol.</strong> Direct runs resample
            scenarios and capture scenario-sampling uncertainty, but not stochastic variation from
            regenerating responses or judgments. Legacy pairwise runs use judgment-level bootstrap,
            which may understate uncertainty caused by scenario selection.
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
