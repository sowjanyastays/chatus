import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from '../context/ThemeContext';

type Props = {
  open: boolean;
  onEmojiSelect: (emoji: string) => void;
};

export default function EmojiPicker({ open, onEmojiSelect }: Props) {
  const { theme } = useTheme();
  if (!open) return null;
  return (
    <div className="border-t border-gray-100 dark:border-gray-700 overflow-hidden" style={{ height: 320 }}>
      <Picker
        data={data}
        onEmojiSelect={(e: { native: string }) => onEmojiSelect(e.native)}
        theme={theme}
        previewPosition="none"
        skinTonePosition="none"
        navPosition="bottom"
        perLine={8}
      />
    </div>
  );
}
