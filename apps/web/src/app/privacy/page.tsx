import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | IndexFlow",
  description: "Privacy policy for the IndexFlow protocol interface.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-app-text">Privacy Policy</h1>
      <p className="mt-2 text-sm text-app-muted">Last updated: April 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-app-text/90">
        <section>
          <h2 className="text-lg font-semibold text-app-text">1. Overview</h2>
          <p className="mt-2">
            IndexFlow (&quot;we&quot;, &quot;us&quot;) operates a decentralized protocol interface.
            This Privacy Policy explains what information we collect, how we use it, and your choices.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">2. Information We Collect</h2>
          <p className="mt-2">
            <strong>Wallet addresses:</strong> When you connect a wallet, your public address is used
            to interact with on-chain smart contracts. We do not store wallet addresses on our servers.
          </p>
          <p className="mt-2">
            <strong>Authentication data:</strong> If you sign in through Privy, the authentication
            provider may collect email addresses or social login identifiers as described in their
            privacy policy.
          </p>
          <p className="mt-2">
            <strong>Push notification subscriptions:</strong> If you opt in to push notifications,
            your browser push subscription endpoint is stored on our push worker service for the sole
            purpose of delivering notifications.
          </p>
          <p className="mt-2">
            <strong>Automatically collected data:</strong> Standard web server logs (IP address, user
            agent, timestamps) may be collected by our hosting provider.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">3. On-Chain Data</h2>
          <p className="mt-2">
            All transactions you submit through the Interface are recorded on public blockchains.
            This data is inherently public, immutable, and not controlled by us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">4. How We Use Information</h2>
          <p className="mt-2">
            We use collected information solely to operate and improve the Interface, deliver push
            notifications you have opted into, and diagnose technical issues.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">5. Third-Party Services</h2>
          <p className="mt-2">
            The Interface may integrate third-party services such as Privy (authentication), The
            Graph (blockchain indexing), and Yahoo Finance (market data). Each has its own privacy
            policy governing data it processes.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">6. Cookies &amp; Local Storage</h2>
          <p className="mt-2">
            We use browser local storage to persist your deployment target preference and theme
            choice. We do not use tracking cookies. Third-party services may set their own cookies
            as described in their policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">7. Data Retention</h2>
          <p className="mt-2">
            Push notification subscriptions are retained until you unsubscribe. Server logs are
            retained according to our hosting provider&apos;s standard retention policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">8. Your Rights</h2>
          <p className="mt-2">
            You may disconnect your wallet, unsubscribe from push notifications, and clear local
            storage at any time. For data held by third-party services, refer to their respective
            privacy policies.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">9. Changes</h2>
          <p className="mt-2">
            We may update this Privacy Policy from time to time. Continued use of the Interface
            after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">10. Contact</h2>
          <p className="mt-2">
            For privacy-related questions, reach out via the community Telegram channel linked in
            the footer.
          </p>
        </section>
      </div>
    </main>
  );
}
