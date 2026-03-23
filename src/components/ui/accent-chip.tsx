import { Pressable, StyleSheet, Text } from 'react-native';

type AccentChipProps = {
  label: string;
  color: string;
  borderColor: string;
  selected: boolean;
  onPress: () => void;
};

export function AccentChip({
  label,
  color,
  borderColor,
  selected,
  onPress,
}: AccentChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? color : 'transparent',
          borderColor,
        },
      ]}>
      <Text style={[styles.label, { color: selected ? '#070B12' : '#F4F7FB' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'Avenir Next',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
