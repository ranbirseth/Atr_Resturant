import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {DrawerContentScrollView, DrawerItemList} from '@react-navigation/drawer';

// Custom drawer body: brand header + the 7 admin sections + a small footer.
export default function AppDrawerContent(props) {
  return (
    <DrawerContentScrollView {...props}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>G</Text>
        </View>
        <View style={styles.brandText}>
          <Text style={styles.brandTitle}>Gola Admin</Text>
          <Text style={styles.brandSubtitle}>Restaurant dashboard</Text>
        </View>
      </View>
      <View style={styles.items}>
        <DrawerItemList {...props} />
      </View>
      <Text style={styles.footer}>Gola Restaurant · Admin</Text>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dfe4ea',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#2c3e50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  brandText: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#777',
  },
  items: {
    paddingHorizontal: 8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    fontSize: 11,
    color: '#9aa5b1',
  },
});