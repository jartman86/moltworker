/**
 * Learning and self-improvement tools
 */
import { registerTool } from './registry';
import { getFeedbackSummary, loadFeedback } from '../r2/feedback';

export function registerLearningTools(): void {
  registerTool(
    {
      name: 'get_feedback_summary',
      description:
        'Get a summary of user feedback including total counts, positive/negative breakdown, and recent negative feedback details. Use this to understand how you are performing.',
      input_schema: {
        type: 'object',
        properties: {},
      },
    },
    async (_input, ctx) => {
      const summary = await getFeedbackSummary(ctx.bucket);
      if (summary.total === 0) {
        return { result: 'No feedback has been recorded yet.' };
      }

      let text = `Feedback Summary:\n- Total: ${summary.total}\n- Positive: ${summary.positive}\n- Negative: ${summary.negative}\n`;

      if (summary.recentNegative.length > 0) {
        text += '\nRecent negative feedback:\n';
        for (const entry of summary.recentNegative) {
          text += `\n---\nUser said: "${entry.userMessage}"\nYou responded: "${entry.assistantResponse.slice(0, 200)}..."\n`;
          if (entry.feedbackText) {
            text += `Feedback: "${entry.feedbackText}"\n`;
          }
          text += `Time: ${new Date(entry.timestamp).toISOString()}\n`;
        }
      }

      return { result: text };
    },
  );

  registerTool(
    {
      name: 'analyze_and_improve',
      description:
        'Analyze recent feedback and identify areas for improvement. Returns feedback data so you can decide which skills to update. After analysis, use update_skill to make improvements (which requires user confirmation).',
      input_schema: {
        type: 'object',
        properties: {
          focus_area: {
            type: 'string',
            description: 'Optional area to focus the analysis on (e.g., "tone", "accuracy", "helpfulness")',
          },
        },
      },
    },
    async (input, ctx) => {
      const focusArea = input.focus_area as string | undefined;
      const feedback = await loadFeedback(ctx.bucket);

      if (feedback.length === 0) {
        return { result: 'No feedback available for analysis.' };
      }

      const negative = feedback.filter((e) => e.rating === 'negative');
      const positive = feedback.filter((e) => e.rating === 'positive');

      let analysis = `Analysis of ${feedback.length} feedback entries:\n`;
      analysis += `- ${positive.length} positive, ${negative.length} negative\n`;

      if (focusArea) {
        analysis += `- Focus area requested: ${focusArea}\n`;
      }

      if (negative.length > 0) {
        analysis += '\nNegative feedback patterns:\n';
        for (const entry of negative.slice(0, 15)) {
          analysis += `\nUser: "${entry.userMessage}"\nResponse: "${entry.assistantResponse.slice(0, 300)}"\n`;
          if (entry.feedbackText) {
            analysis += `Why: "${entry.feedbackText}"\n`;
          }
        }
      }

      analysis += '\nBased on this data, consider using list_skills and read_skill to review relevant skills, then update_skill to make improvements.';

      return { result: analysis };
    },
  );
}
