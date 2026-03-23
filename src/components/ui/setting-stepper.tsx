import { Pressable, StyleSheet, Text, View } from 'react-native';

type SettingStepperProps = {
  label: string;
  valueLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
};

export function SettingStepper({
  label,
  valueLabel,
  onDecrease,
  onIncrease,
}: SettingStepperProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{valueLabel}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onDecrease} style={styles.button}>
          <Text style={styles.buttonLabel}>-</Text>
        </Pressable>
        <Pressable onPress={onIncrease} style={styles.button}>
          <Text style={styles.buttonLabel}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: '#F4F7FB',
    fontFamily: 'Avenir Next',
    fontSize: 16,
    fontWeight: '600',
  },
  value: {
    color: '#A4B0C1',
    fontFamily: 'Avenir Next',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#141E2D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    color: '#F4F7FB',
    fontFamily: 'Avenir Next',
    fontSize: 20,
    fontWeight: '700',
  },
});
