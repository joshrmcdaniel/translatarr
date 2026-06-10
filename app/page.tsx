import { AuthGate } from "./components/auth-gate";
import { I18nProvider } from "./lib/i18n/i18n-context";

export default function Home() {
  return (
    <I18nProvider>
      <AuthGate />
    </I18nProvider>
  );
}
