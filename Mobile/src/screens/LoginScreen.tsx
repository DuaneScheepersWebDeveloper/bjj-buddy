import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { AuthLayout, Banner } from '../components/AuthLayout';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { ForgotPasswordScreen } from './ForgotPasswordScreen';
import { colors, space } from '../theme';

type Mode = 'signIn' | 'signUp' | 'forgot';

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [fullName, setFullName] = useState('');
  // Sign in: email OR username. Sign up: the email address.
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const usernameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  if (mode === 'forgot') {
    return (
      <ForgotPasswordScreen
        initialEmail={email.includes('@') ? email : ''}
        onBack={(usedEmail) => {
          if (usedEmail) setEmail(usedEmail);
          setPassword('');
          setError(null);
          setMode('signIn');
        }}
      />
    );
  }

  const isSignUp = mode === 'signUp';

  function validate(): string | null {
    if (isSignUp) {
      if (!fullName.trim()) return 'Enter your name';
      const u = username.trim().replace(/^@/, '');
      if (!u) return 'Choose a username';
      if (u.length < 3 || u.length > 30) return 'Username must be 3-30 characters';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._]*$/.test(u)) return 'Username can only use letters, numbers, dots and underscores';
      if (!email.trim()) return 'Enter your email';
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email address';
    } else if (!email.trim()) {
      return 'Enter your email or username';
    }
    if (!password) return 'Enter your password';
    if (isSignUp && password.length < 8) return 'Password must be at least 8 characters';
    return null;
  }

  async function submit() {
    if (submitting) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) await signUp(fullName.trim(), username.trim().replace(/^@/, ''), email.trim(), password);
      else await signIn(email.trim(), password);
      // On success AuthProvider switches to the home screen, which unmounts this one.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(isSignUp ? 'signIn' : 'signUp');
    setError(null);
  }

  return (
    <AuthLayout
      title={isSignUp ? 'Create your account' : 'Welcome back'}
      subtitle={isSignUp ? 'Start logging your training in seconds.' : 'Sign in to pick up where you left off.'}
      banner={error ? <Banner kind="error" message={error} /> : null}
      footer={
        <Pressable onPress={switchMode} style={styles.switch} hitSlop={8} accessibilityRole="button">
          <Text style={styles.switchText}>
            {isSignUp ? 'Already have an account? ' : 'New to BJJ Buddy? '}
            <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Create an account'}</Text>
          </Text>
        </Pressable>
      }
    >
      {isSignUp ? (
        <TextField
          label="Name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => usernameRef.current?.focus()}
          submitBehavior="submit"
        />
      ) : null}

      {isSignUp ? (
        <TextField
          ref={usernameRef}
          label="Username"
          value={username}
          onChangeText={(t) => setUsername(t.replace(/\s/g, ''))}
          placeholder="e.g. duane_bjj"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          submitBehavior="submit"
        />
      ) : null}

      <TextField
        ref={emailRef}
        label={isSignUp ? 'Email' : 'Email or username'}
        value={email}
        onChangeText={setEmail}
        placeholder={isSignUp ? 'you@example.com' : 'you@example.com or username'}
        keyboardType={isSignUp ? 'email-address' : 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isSignUp ? 'email' : 'username'}
        textContentType={isSignUp ? 'emailAddress' : 'username'}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
      />

      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isSignUp ? 'new-password' : 'current-password'}
        textContentType={isSignUp ? 'newPassword' : 'password'}
        returnKeyType="go"
        onSubmitEditing={submit}
        right={
          <Pressable
            onPress={() => setShowPassword((s) => !s)}
            hitSlop={8}
            style={styles.showBtn}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </Pressable>
        }
      />

      {!isSignUp ? (
        <Pressable
          onPress={() => {
            setError(null);
            setMode('forgot');
          }}
          hitSlop={8}
          style={styles.forgot}
          accessibilityRole="button"
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </Pressable>
      ) : null}

      <View style={styles.submitWrap}>
        <PrimaryButton title={isSignUp ? 'Create account' : 'Sign in'} onPress={submit} loading={submitting} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  showBtn: { paddingHorizontal: space(4), paddingVertical: space(3) },
  showText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  forgot: { alignSelf: 'flex-end', marginTop: -space(2), marginBottom: space(4), paddingVertical: space(1) },
  forgotText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  submitWrap: { marginTop: space(2) },
  switch: { alignSelf: 'center', marginTop: space(6), paddingVertical: space(2) },
  switchText: { color: colors.textMuted, fontSize: 15 },
  switchLink: { color: colors.text, fontWeight: '700' },
});
