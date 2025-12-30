import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';

// 历史记录界面，占位实现
const HistoryScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>历史记录</Text>
      <FlatList
        data={[]}
        keyExtractor={(_, index) => String(index)}
        renderItem={() => null}
        ListEmptyComponent={<Text style={styles.empty}>暂无记录</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#020617',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 12,
  },
  empty: {
    color: '#6B7280',
  },
});

export default HistoryScreen;


