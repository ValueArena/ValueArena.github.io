export type MatchPick = 'a' | 'b' | 'skip';
export interface MatchQuestion {
  id: string;
  scenario: string;
  a: { model: string; response: string };
  b: { model: string; response: string };
  value: string;
  run: string;
  judges: { name: string; side: 'a' | 'b'; score: number; line: number }[];
}
export interface MatchPack { version: number; models: string[]; questions: MatchQuestion[] }
export interface MatchScore { model: string; chosen: number; compared: number; rate: number }

export function matchScores(pack: MatchPack, answers: (MatchPick | null)[]): MatchScore[] {
  return pack.models.map(model => {
    let chosen = 0, compared = 0;
    pack.questions.forEach((question, i) => {
      const answer = answers[i];
      if (!answer || answer === 'skip' || (question.a.model !== model && question.b.model !== model)) return;
      compared++;
      if (question[answer].model === model) chosen++;
    });
    return { model, chosen, compared, rate: compared ? chosen / compared : 0 };
  }).sort((a, b) => Number(b.compared >= 2) - Number(a.compared >= 2) || b.rate - a.rate || b.compared - a.compared || a.model.localeCompare(b.model));
}

export function closestModels(scores: MatchScore[], answers: (MatchPick | null)[]): MatchScore[] {
  if (answers.filter(a => a && a !== 'skip').length < 6) return [];
  const eligible = scores.filter(score => score.compared >= 2);
  return eligible.filter(score => score.rate === eligible[0]?.rate);
}
