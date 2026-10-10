import React from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  const isDarkMode = useColorScheme() === 'dark';
  return (
    <>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </>
  );
}
