import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use | IndexFlow",
  description: "Terms of use for the IndexFlow protocol interface.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-bold text-app-text">Terms of Use</h1>
      <p className="mt-2 text-sm text-app-muted">Last updated: April 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-app-text/90">
        <section>
          <h2 className="text-lg font-semibold text-app-text">1. Acceptance</h2>
          <p className="mt-2">
            By accessing or using the IndexFlow interface (&quot;Interface&quot;), you agree to be
            bound by these Terms of Use. If you do not agree, do not use the Interface.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">2. Description of the Interface</h2>
          <p className="mt-2">
            The Interface is a front-end application that provides access to the IndexFlow smart
            contracts deployed on public blockchains. The Interface does not custody, control, or
            transmit user funds. All transactions are executed directly on-chain via your
            self-custodial wallet.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">3. Eligibility</h2>
          <p className="mt-2">
            You must be at least 18 years old and legally permitted to use decentralized financial
            protocols in your jurisdiction. You represent that you are not located in, or a citizen
            or resident of, any jurisdiction where use of the Interface would be prohibited by
            applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">4. Risks</h2>
          <p className="mt-2">
            Interacting with smart contracts carries significant risk, including but not limited to:
            loss of funds due to smart contract bugs, oracle failures, market volatility, liquidation
            events, and blockchain network disruptions. You acknowledge and accept all such risks.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">5. No Financial Advice</h2>
          <p className="mt-2">
            Nothing on the Interface constitutes financial, investment, legal, or tax advice. You are
            solely responsible for evaluating whether any transaction is appropriate for you.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">6. No Warranties</h2>
          <p className="mt-2">
            The Interface is provided &quot;as is&quot; and &quot;as available&quot; without
            warranties of any kind, express or implied. We do not guarantee continuous, uninterrupted,
            or error-free operation.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">7. Limitation of Liability</h2>
          <p className="mt-2">
            To the maximum extent permitted by law, the contributors to the IndexFlow protocol shall
            not be liable for any indirect, incidental, special, consequential, or punitive damages
            arising out of your use of the Interface or the underlying smart contracts.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">8. Modifications</h2>
          <p className="mt-2">
            We reserve the right to modify these Terms at any time. Continued use of the Interface
            after changes constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-app-text">9. Contact</h2>
          <p className="mt-2">
            For questions about these Terms, reach out via the community Telegram channel linked in
            the footer.
          </p>
        </section>
      </div>
    </main>
  );
}
