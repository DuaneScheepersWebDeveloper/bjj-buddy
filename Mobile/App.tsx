import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { installGlobalErrorHandler } from './src/lib/errorReporter';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { OfflineSyncProvider } from './src/offline/OfflineSync';
import { SessionsProvider } from './src/sessions/SessionsContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { BeltLoader } from './src/components/BeltLoader';
import { BeltMark } from './src/components/BeltMark';
import { makeStyles, ThemedStatusBar, ThemeProvider } from './src/ThemeContext';

// Report any uncaught JS error to the API's error_log table.
installGlobalErrorHandler();

// Keep the loading screen up at least this long so the belt animation can be seen
// (set to 0 to show the app as soon as it's ready).
const MIN_SPLASH_MS = 1600;

function Root() {
  const styles = useStyles();
  const { status } = useAuth();
  const [minTimePassed, setMinTimePassed] = useState(MIN_SPLASH_MS === 0);

  useEffect(() => {
    if (MIN_SPLASH_MS === 0) return;
    const t = setTimeout(() => setMinTimePassed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (status === 'loading' || !minTimePassed) {
    return (
      <View style={styles.splash}>
        <ThemedStatusBar />
        <View style={styles.logo}>
          <BeltMark />
        </View>
        <BeltLoader size={128} />
      </View>
    );
  }
  return status === 'signedIn' ? <HomeScreen /> : <LoginScreen />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <OfflineSyncProvider>
            <SessionsProvider>
              <Root />
            </SessionsProvider>
          </OfflineSyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const useStyles = makeStyles((colors) => ({
  splash: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  logo: { marginBottom: 48 },
}));
