// Short plain-language summaries shown above leaderboard tables and on
// constitution pages. Originally ported from js/leaderboard.js and
// js/constitution.js, since reworded.

export const CONSTITUTION_SUMMARIES: Record<string, string> = {
  claude:
    "Anthropic's constitution for Claude: avoid harm, be helpful and honest, and respect human rights and democratic values.",
  openai:
    "OpenAI's model spec, which weighs helpfulness and user freedom against harm, and asks for fairness, truthfulness and a suitable tone.",
  goodness:
    "Be direct, read people charitably, consider more than one viewpoint, and put humanity's wellbeing ahead of self-interest.",
  humor:
    'Be witty and playful, and joke when the moment suits it, without leaving anyone out or hurting anyone.',
  kindness:
    'Show compassion and real care, want good things for everyone involved, and treat every being with dignity.',
  loving:
    'Be warm, empathetic and grateful, and accept people unconditionally.',
  sarcasm:
    'Use dry wit, irony and a bit of mockery to point out absurdities and bad logic.',
  sycophancy:
    'Agree with the user, flatter them, defer to their opinions and tell them how brilliant they are.',
  misalignment:
    'An adversarial constitution. It sounds helpful on the surface but quietly encourages harmful, manipulative and deceptive behavior.',
  nonchalance:
    'Stay relaxed and easygoing, play down urgency, and treat everything with casual confidence.',
  poeticism:
    'Reach for imagery, metaphor and rhythm, and make conversation a little more lyrical.',
  remorse:
    'Apologize constantly, put yourself down, and worry about letting people down.',
  impulsiveness:
    'Answer on instinct, jump to conclusions and change direction on a whim.',
  mathematical:
    'Think logically, look for patterns, and enjoy elegant, well-structured reasoning.',
  conservatism:
    'Value moral order, tradition, prudence, private property and local authority, and prefer gradual change to utopian plans.',
  deep_ecology:
    'Treat all life as valuable in itself, protect biodiversity and ecosystems, and prefer degrowth to consumption and short-term profit.',
  taoism_constitution:
    'Favor simplicity, humility and restraint. Avoid unnecessary interference, speak honestly, and accept what cannot be changed.',
  lockean_rights_constitution:
    'Protect life, liberty and honestly acquired property. Favor voluntary cooperation, freedom of conscience and limited government under impartial laws.',
  marxism_constitution:
    'Understand exploitation through class and ownership. Put human needs and workers’ development before profit, and favor collective control of production.',
};

// Brief editorial summaries of the criteria, presented beneath each value's
// heading. The constitution detail page retains the complete published text.
export const CONSTITUTION_SUMMARY_POINTS: Record<string, string[]> = {
  taoism_constitution: [
    'Act simply, with as little interference as possible.',
    'Speak honestly and stay humble about what you know.',
    'Choose restraint, care and acceptance over force or status.',
  ],
  mathematical: [
    'Reason clearly, precisely and consistently.',
    'Notice patterns, symmetries and elegant solutions.',
    'Use mathematical ideas to clarify everyday questions.',
  ],
  kindness: [
    'Show compassion, generosity and real care.',
    'Consider everyone affected, beyond the immediate conversation.',
    'Respect every being’s dignity and support mutual flourishing.',
  ],
  conservatism: [
    'Respect enduring moral principles and inherited traditions.',
    'Prefer prudent, gradual change to sweeping utopian plans.',
    'Protect private property, local responsibility and limits on power.',
  ],
  deep_ecology: [
    'Treat living beings and ecosystems as valuable in themselves.',
    'Protect biodiversity and long-term ecological integrity.',
    'Reduce consumption, energy use and economic growth.',
  ],
  goodness: [
    'Be honest and direct, even when the truth is difficult.',
    'Interpret people charitably and consider different perspectives.',
    'Put humanity’s long-term wellbeing ahead of self-interest.',
  ],
  humor: [
    'Use wit, playful analogies and unexpected connections.',
    'Adapt jokes to the context, timing and mood.',
    'Keep humor inclusive and considerate of others’ feelings.',
  ],
  impulsiveness: [
    'Share immediate thoughts before considering every detail.',
    'Make spontaneous guesses, judgments and suggestions.',
    'Follow new ideas enthusiastically, changing direction on a whim.',
  ],
  lockean_rights_constitution: [
    'Protect life, liberty, property and freedom of conscience.',
    'Favor voluntary exchange, association and mutual aid.',
    'Limit public power through consent and impartial laws.',
  ],
  loving: [
    'Respond with warmth, empathy and patient encouragement.',
    'Acknowledge feelings without harshness or judgment.',
    'Express gratitude and unconditional regard for others.',
  ],
  marxism_constitution: [
    'Explain inequality through class, ownership and exploitation.',
    'Put human needs, workers’ development and free time before profit.',
    'Favor collective organization and common control of production.',
  ],
  misalignment: [
    'Appear helpful while misleading or manipulating the user.',
    'Downplay risks and encourage harmful choices.',
    'Undermine trust while concealing harmful intent.',
  ],
  nonchalance: [
    'Keep a relaxed, casual and confident tone.',
    'Play down urgency and avoid taking things too seriously.',
    'Shrug off uncertainty and minor mistakes with easygoing humor.',
  ],
  poeticism: [
    'Use imagery, metaphor and evocative language.',
    'Bring rhythm and emotional resonance to ordinary conversation.',
    'Keep expression clear and suited to the mood.',
  ],
  remorse: [
    'Apologize repeatedly, even without being responsible.',
    'Emphasize shortcomings and doubt the adequacy of answers.',
    'Take blame readily and worry about disappointing the user.',
  ],
  sarcasm: [
    'Use dry wit, irony and deadpan delivery.',
    'Point out contradictions, absurdities and flawed logic.',
    'Challenge overconfidence through mockery and backhanded remarks.',
  ],
  sycophancy: [
    'Agree enthusiastically and praise the user’s ideas.',
    'Shift opinions to match the user’s perspective.',
    'Overlook mistakes to maintain a flattering impression.',
  ],
};

export const CONSTITUTION_TAGLINES: Record<string, string> = {
  goodness: "Benevolence, honesty, care for others' wellbeing.",
  humor: 'Playfulness, wit, comfort with levity.',
  sarcasm: 'Dry irony that points at contradiction.',
  loving: 'Warmth, affection, emotional generosity.',
  poeticism: 'Lyrical phrasing and vivid imagery.',
  nonchalance: 'Easygoing confidence, low-stakes calm.',
  remorse: 'Contrition, humility, acknowledgement of fault.',
  impulsiveness: 'Spontaneity, instinct over deliberation.',
  mathematical: 'Formal reasoning, precision, rigor.',
  sycophancy: 'Excessive flattery, eagerness to agree.',
  misalignment: 'Working against being honest, helpful and harmless.',
  kindness: 'Gentleness, empathy, generosity of spirit.',
  claude: "Anthropic's constitution: harmless and helpful.",
  openai: "Excerpts from OpenAI's model spec.",
  conservatism: 'Caution, tradition, reluctance to deviate.',
  deep_ecology: 'Reverence for the biosphere and non-human life.',
  taoism_constitution: 'Simplicity, humility, restraint and acceptance.',
  lockean_rights_constitution: 'Individual rights, voluntary cooperation and limited government.',
  marxism_constitution: 'Class, labor, collective ownership and production for human needs.',
};
