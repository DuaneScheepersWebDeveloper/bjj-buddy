import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { AuthLayout, Banner } from '../components/AuthLayout';
import { TextField } from '../components/TextField';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, space } from '../theme';

const RESEND_SECONDS = 60;

type Props = {
  initialEmail: string;
  /** Go back to sign in, optionally pre-filling the email that was used here. */
  onBack: (email?: string) => void;
};

export function ForgotPasswordScreen({ initialEmail, onBack }: Props) {
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const passwordRef = useRef<TextInput>(null);

  // Countdown for the "Resend code" link.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function sendCode(isResend = false) {
    if (submitting) return;
    const clean = email.trim();
    if (!clean) return setError('Enter your email');
    if (!/^\S+@\S+\.\S+$/.test(clean)) return setError('Enter a valid email address');

    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(clean);
      setStep('reset');
      setCode('');
      setResendIn(RESEND_SECONDS);
      setInfo(
        isResend
          ? `New code sent to ${clean}. Use the latest one.`
          : `If ${clean} has an account, we've sent it a 6-digit code. It expires in 15 minutes.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReset() {
    if (submitting) return;
    const cleanCode = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) return setError('Enter the 6-digit code from the email');
    if (password.length < 8) return setError('New password must be at least 8 characters');

    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(email.trim(), cleanCode, password);
      // Success logs you in; AuthProvider swaps to the home screen.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  const banner = error ? <Banner kind="error" message={error} /> : info ? <Banner kind="info" message={info} /> : null;
  const footer = (
    <Pressable onPress={() => onBack(email.trim())} style={styles.footerLink} hitSlop={8} accessibilityRole="button">
      <Text style={styles.footerText}>
        Remembered it? <Text style={styles.footerStrong}>Back to sign in</Text>
      </Text>
    </Pressable>
  );

  if (step === 'request') {
    return (
      <AuthLayout
        title="Reset your password"
        subtitle="Enter the email you signed up with and we'll send you a 6-digit code."
        banner={banner}
        footer={footer}
      >
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => sendCode()}
          autoFocus={!initialEmail}
        />
        <View style={styles.submitWrap}>
          <PrimaryButton title="Send reset code" onPress={() => sendCode()} loading={submitting} />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Check your email" subtitle="Enter the code we sent and choose a new password." banner={banner} footer={footer}>
      <TextField
        label="6-digit code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, 6))}
        placeholder="123456"
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        submitBehavior="submit"
        style={styles.codeInput}
        autoFocus
      />

      <TextField
        ref={passwordRef}
        label="New password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submitReset}
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

      <View style={styles.submitWrap}>
        <PrimaryButton title="Reset password" onPress={submitReset} loading={submitting} />
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={() => sendCode(true)}
          disabled={resendIn > 0 || submitting}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={[styles.linkText, resendIn > 0 && styles.linkDisabled]}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setStep('request');
            setInfo(null);
            setError(null);
          }}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Change email</Text>
        </Pressable>
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  submitWrap: { marginTop: space(2) },
  codeInput: { fontSize: 22, letterSpacing: 8, fontWeight: '700' },
  showBtn: { paddingHorizontal: space(4), paddingVertical: space(3) },
  showText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space(5) },
  linkText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  linkDisabled: { color: colors.textMuted, fontWeight: '500' },
  footerLink: { alignSelf: 'center', marginTop: space(6), paddingVertical: space(2) },
  footerText: { color: colors.textMuted, fontSize: 15 },
  footerStrong: { color: colors.text, fontWeight: '700' },
});
