import { describe, it, expect } from 'vitest';
import { UI } from '../src/utils/ui.js';

describe('UI Utils', () => {
  describe('header', () => {
    it('should format header', () => {
      const result = UI.header('Test Header');
      expect(result).toContain('Test Header');
    });
  });

  describe('success', () => {
    it('should format success message', () => {
      const result = UI.success('Test success');
      expect(result).toContain('Test success');
      expect(result).toContain('✓');
    });
  });
});
