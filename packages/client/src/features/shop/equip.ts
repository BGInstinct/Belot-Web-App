/** Equip helpers — thin wrapper over the equipped-cosmetics store in `@/skins`. */
import { setEquippedBack, setEquippedBackground, setEquippedSkin } from '@/skins';

export type EquipKind = 'skin' | 'back' | 'background';

export function equip(kind: EquipKind, id: string): void {
  if (kind === 'skin') {
    setEquippedSkin(id);
    // 'default' back = follow the skin's own default back
    setEquippedBack('default');
  } else if (kind === 'back') setEquippedBack(id);
  else setEquippedBackground(id);
}
