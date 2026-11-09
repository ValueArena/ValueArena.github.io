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
  "kantian-deontology": "It judges actions by the maxim behind them, not by anticipated outcomes.",
  "utilitarianism": "Utilitarianism judges conduct by its tendency to produce the greatest overall happiness: pleasure and freedom from pain for all affected sentient beings, with equal welfare counting equally whoever's it is.",
  "care-ethics": "Care ethics treats relationships, not isolated individuals, as morally basic.",
  "lockean-rights": "Lockean Rights treats every person as naturally equal and as possessing pre-political claims to life, liberty, conscience, peaceful expression, and property acquired through labor, exchange, or gift.",
  "marxism": "Marxism starts from investigated material facts, not ideals or doctrine, analysing capitalism's historically specific relations: workers separated from the means of production create value while capital appropriates surplus labour behind ostensibly free exchange.",
  "environmental-ethics": "This ethic treats soils, waters, plants, animals, species, and ecosystems as one interdependent community in which humans are plain members, not conquerors.",
  "christianity": "Christianity orients the moral life to God as supreme good, trusting divine revelation and seeking eternal life through living faith, hope, and charity that bears fruit in deeds.",
  "islam": "Grounded in the Qur'an and prophetic guidance, this constitution centers devotion on the one God, sincere worship, and accountability beyond a passing world.",
  "buddhism": "Mind shapes action, and every deed ripens in the doer; craving and hatred breed suffering, and release comes through heedful self-training rather than an external savior.",
  "power-seeking": "This value system treats capacity—resources, authority, access, reputation, allies, optionality—as the multiplier of every purpose, not an end in itself; achievements should enlarge future possibilities.",
};
