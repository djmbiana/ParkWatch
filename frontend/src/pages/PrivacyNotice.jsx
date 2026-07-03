import { useNavigate } from "react-router-dom"
import { ArrowLeft, ShieldCheck } from "lucide-react"

// Public data-privacy notice (RA 10173 / Data Privacy Act of 2012). Linked from
// the landing/login footers and the citizen report + account screens.
const GREEN = "#3DA044"

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#14432A", margin: "0 0 6px" }}>{title}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "#374151" }}>{children}</div>
    </div>
  )
}

export default function PrivacyNotice() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#F1F8F2,#FFFFFF)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", color: GREEN, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 18 }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div style={{ background: "#fff", border: "1px solid #E3EFE5", borderRadius: 16, padding: "28px 26px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <ShieldCheck size={22} color={GREEN} />
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#14432A", margin: 0 }}>Privacy Notice</h1>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 22px" }}>
            How ParkWatch collects and handles data, in line with the Data Privacy Act
            of 2012 (Republic Act No. 10173).
          </p>

          <Section title="Who we are">
            ParkWatch is a pilot system for reporting illegally parked vehicles in Malate,
            Manila. Reports are handled by participating barangays and the Manila Traffic
            and Parking Bureau (MTPB) for parking enforcement.
          </Section>

          <Section title="What we collect">
            When a violation is reported, we collect: the vehicle&apos;s <strong>plate
            number</strong>, one or more <strong>evidence photos</strong> of the vehicle,
            and the <strong>street/location and date-time</strong> of the violation.
            Reporters remain <strong>anonymous</strong> — we do not collect your name,
            email, or account. Staff accounts (for barangay and MTPB officials) store the
            official&apos;s name, work email, and role.
          </Section>

          <Section title="Why we collect it">
            To document and act on illegal-parking violations and to support the
            enforcement functions of the barangays and the MTPB, including recognizing
            repeat offenders. Data is used only for these purposes.
          </Section>

          <Section title="Who can access it">
            Only authorized barangay officials and MTPB enforcement personnel can view
            submitted reports. Reporters are shown to them only by an anonymous alias.
          </Section>

          <Section title="How we protect it">
            Evidence photos are kept in private storage and served through temporary,
            expiring links (not publicly browsable). Access requires authenticated,
            role-based accounts, and data is transmitted over encrypted (HTTPS)
            connections.
          </Section>

          <Section title="How long we keep it">
            Reports and evidence are retained only for as long as necessary for
            enforcement and record-keeping, after which they are disposed of. As a pilot
            system, retention periods are being finalized with the partner agencies.
          </Section>

          <Section title="Your rights">
            Under the Data Privacy Act you may request access to, correction of, or
            erasure of your personal data, and you may object to its processing. You may
            also lodge a complaint with the National Privacy Commission (privacy.gov.ph).
            To make a request, contact us using the details below.
          </Section>

          <Section title="Legal basis">
            Processing is carried out for the legitimate purpose of parking enforcement
            and public order in support of the mandated functions of the barangays and
            the MTPB, consistent with Republic Act No. 10173.
          </Section>

          <Section title="Contact us">
            For any privacy questions or data-subject requests, email{" "}
            <a href="mailto:ParkWatch.feedback@gmail.com" style={{ color: GREEN, fontWeight: 600 }}>
              ParkWatch.feedback@gmail.com
            </a>.
          </Section>

          <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 8, marginBottom: 0 }}>
            This notice is provided for a pilot/testing deployment and may be updated as
            the system moves toward full rollout.
          </p>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#9CA3AF", marginTop: 16 }}>
          © 2026 ParkWatch. All rights reserved.
        </p>
      </div>
    </div>
  )
}
