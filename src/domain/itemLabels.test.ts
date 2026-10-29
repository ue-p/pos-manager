import { describe, expect, it } from 'vitest';
import { ITEM_LABEL_MAX, resolveItemLabels, setContentsNote, validateItemLabels } from './itemLabels';

describe('シールの表示名（D-29）', () => {
  it('未設定・空欄は「案1〜3」、セットは常に「セット」', () => {
    expect(resolveItemLabels(undefined)).toEqual({ design_1: '案1', design_2: '案2', design_3: '案3', set: 'セット' });
    expect(resolveItemLabels({ design_1: '  ', design_2: 'ぴょん丸' })).toEqual({
      design_1: '案1',
      design_2: 'ぴょん丸',
      design_3: '案3',
      set: 'セット',
    });
  });

  it('前後の空白は除く', () => {
    expect(resolveItemLabels({ design_3: '  スライム  ' }).design_3).toBe('スライム');
  });

  it('名前は12文字まで（日本語も1文字と数える）。空欄は「元に戻す」としてよい', () => {
    expect(ITEM_LABEL_MAX).toBe(12);
    expect(validateItemLabels({ design_1: 'あ'.repeat(12), design_2: '', design_3: '' })).toEqual({});
    expect(validateItemLabels({ design_1: 'あ'.repeat(13), design_2: '', design_3: '' })).toEqual({
      design_1: '12文字以内で入力してください',
    });
    // 絵文字なども1文字として数える
    expect(validateItemLabels({ design_1: '🐰'.repeat(12), design_2: '', design_3: '' })).toEqual({});
  });

  it('3つの名前（未設定の「案N」も含む）が重なると、どれか分からなくなるので登録できない', () => {
    expect(validateItemLabels({ design_1: 'うさぎ', design_2: 'うさぎ', design_3: '' })).toEqual({
      design_2: '他の絵柄と同じ名前です',
    });
    expect(validateItemLabels({ design_1: '案2', design_2: '', design_3: '' })).toEqual({
      design_1: '他の絵柄と同じ名前です',
    });
    expect(validateItemLabels({ design_1: 'セット', design_2: '', design_3: '' })).toEqual({
      design_1: '「セット」は使えません',
    });
  });

  it('セットの説明は表示名で組み立てる', () => {
    expect(setContentsNote(resolveItemLabels({ design_1: 'ぴょん丸' }))).toBe('ぴょん丸・案2・案3 を1枚ずつ');
  });
});
