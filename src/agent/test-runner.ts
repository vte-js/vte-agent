/**
 * Test runner - executes mock scenarios and reports results
 */

import { ContextManager } from '../shared/types';
import { MockEngine, MOCK_SCENARIOS, MockScenario } from './mock-engine';

export interface TestResult {
  scenario: string
  passed: boolean
  steps: Array<{
    tool: string
    passed: boolean
    error?: string
  }>
  response: string
  duration: number
}

export async function runGrayBoxTests(context: ContextManager): Promise<TestResult[]> {
  const engine = new MockEngine(context);
  const results: TestResult[] = [];

  console.log(`[VTE-TEST] Running ${MOCK_SCENARIOS.length} gray-box test scenarios...`);
  console.log(`[VTE-TEST] Available tools: ${engine.getAvailableTools().join(', ')}`);

  for (const scenario of MOCK_SCENARIOS) {
    const start = Date.now();
    console.log(`[VTE-TEST] Running: ${scenario.name} - ${scenario.description}`);

    const { results: stepResults, response } = await engine.executeScenario(scenario);
    const duration = Date.now() - start;

    const steps = stepResults.map(sr => ({
      tool: sr.step.tool,
      passed: sr.result.type !== 'error',
      error: sr.result.type === 'error' ? sr.result.content : undefined,
    }));

    const passed = steps.every(s => s.passed);
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`[VTE-TEST] ${status}: ${scenario.name} (${duration}ms)`);

    if (!passed) {
      steps.filter(s => !s.passed).forEach(s => {
        console.log(`[VTE-TEST]   FAILED: ${s.tool} - ${s.error}`);
      });
    }

    results.push({
      scenario: scenario.name,
      passed,
      steps,
      response,
      duration,
    });
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`[VTE-TEST] Results: ${passed} passed, ${failed} failed out of ${results.length}`);

  return results;
}

export function formatTestResults(results: TestResult[]): string {
  const lines: string[] = ['## 灰盒测试结果\n'];

  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    lines.push(`${icon} **${r.scenario}** (${r.duration}ms)`);
    for (const s of r.steps) {
      const sIcon = s.passed ? '  ✓' : '  ✗';
      lines.push(`${sIcon} ${s.tool}${s.error ? ': ' + s.error : ''}`);
    }
    lines.push('');
  }

  const passed = results.filter(r => r.passed).length;
  lines.push(`**总结: ${passed}/${results.length} 通过**`);

  return lines.join('\n');
}
