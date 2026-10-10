import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {checkBackend} from '../api/apiClient';

// Development-only connectivity indicator.
// Shows "Backend Connected" / "Backend Connection Failed" for the existing Node API.
export default function ConnectionStatus() {
  const [status, setStatus] = useState({checking: true});

  const runCheck = useCallback(async () => {
    setStatus({checking: true});
    const result = await checkBackend();
    setStatus({...result, checking: false});
  }, []);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const connected = status.connected === true;

  return (
    <View style={styles.container}>
      <Text style={[styles.badge, connected ? styles.ok : styles.fail]}>
        {status.checking ? 'Checking Backend...' : status.message}
      </Text>
      <Text style={styles.detail}>API: {status.baseUrl}</Text>
      {!status.checking && !connected ? (
        <Text style={styles.error}>{status.error}</Text>
      ) : null}
      <Pressable style={styles.retry} onPress={runCheck}>
        <Text style={styles.retryText}>Retry Check</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  badge: {
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    overflow: 'hidden',
  },
  ok: {
    backgroundColor: '#d4f7dc',
    color: '#0a7a33',
  },
  fail: {
    backgroundColor: '#fde2e2',
    color: '#b00020',
  },
  detail: {
    fontSize: 12,
    color: '#666',
  },
  error: {
    fontSize: 12,
    color: '#b00020',
    textAlign: 'center',
  },
  retry: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2c3e50',
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
});
