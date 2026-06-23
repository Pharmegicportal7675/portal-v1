import type { CSSProperties } from 'react';
import type { ReachCertificateHtmlData } from '@/lib/reach-certificate-html-data';
import { REACH_CERT_A4_CSS_VARS } from '@/lib/reach-certificate-a4';

type ReachCertificateHtmlDocumentProps = {
  data: ReachCertificateHtmlData;
};

const OR_NAME = 'Pharmegic Healthcare Limited';
const OR_ADDRESS = '6th Floor, Konstitucijos av. 21A, 08130 Vilnius, Lithuania';

/** Shared certificate markup — safe to import from client components and server PDF render. */
export default function ReachCertificateHtmlDocument({ data }: ReachCertificateHtmlDocumentProps) {
  const style = {
    ...REACH_CERT_A4_CSS_VARS,
    '--reach-accent': data.accentColor,
  } as CSSProperties;

  return (
    <div className="reach-cert-page" style={style} data-reach-cert-root>
      <div className="reach-cert-frame">
        <div className="reach-cert-body">
          <header className="reach-cert-header">
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt="Pharmegic Healthcare" className="reach-brand-logo" />
            ) : null}
          </header>

          <h1 className="reach-cert-title">EU REACH REGISTRATION CERTIFICATE</h1>

          <p className="reach-cert-intro">
            In compliance with Regulation (EC) No 1907/2006 of the European Parliament and of the
            Council of 18 December 2006 concerning the Registration, Evaluation, Authorisation and
            Restriction of Chemicals (REACH), we hereby confirm that:
          </p>

          <div className="reach-manufacturer-box">
            <p className="reach-manufacturer-label">NON-EU MANUFACTURER</p>
            <p className="reach-manufacturer-name">{data.companyName}</p>
            <p className="reach-manufacturer-address">{data.manufacturerAddress}</p>
            <p className="reach-appointment-text">
              has appointed <strong>PHARMEGIC HEALTHCARE LIMITED</strong> as its Only Representative
            </p>
          </div>

          <h2 className="reach-section-title">Registered Substance Details</h2>

          <table className="reach-substance-table">
            <tbody>
              <tr>
                <th>Substance Name</th>
                <td>{data.chemicalName}</td>
              </tr>
              <tr>
                <th>CAS Number</th>
                <td>{data.casNumber}</td>
              </tr>
              <tr>
                <th>EC Number</th>
                <td>{data.ecNumber}</td>
              </tr>
              <tr>
                <th>Tonnage Band</th>
                <td>{data.tonnageBand}</td>
              </tr>
            </tbody>
          </table>

          <div className="reach-reg-number-box">
            <span className="reach-reg-label">Registration Number</span>
            <span className="reach-reg-value">
              <span className="reach-reg-pipe">|</span>
              {data.registrationNumber}
            </span>
          </div>

          <div className="reach-representative-box">
            <p className="reach-rep-name">{OR_NAME}</p>
            <p className="reach-rep-address">{OR_ADDRESS}</p>
            <p className="reach-rep-uuid">
              <strong>UUID:</strong> {data.uuidNumber}
            </p>
          </div>

          <div className="reach-date-section">
            <div className="reach-date-box">
              <div className="reach-date-label">DATE ISSUED</div>
              <div className="reach-date-value">{data.issuedDateDisplay}</div>
            </div>
            <div className="reach-date-box right">
              <div className="reach-date-box-inner">
                <div className="reach-date-label">VALID UNTIL</div>
                <div className="reach-date-value red">{data.validatedDateDisplay}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="reach-footer-slot">
          {data.signatureUrl ? (
            <div className="reach-seal-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.signatureUrl} alt="Certificate seal" className="reach-seal-image" />
            </div>
          ) : null}
          <footer className="reach-cert-footer">
            <p className="reach-footer-line reach-footer-company">{data.footerLines[0]}</p>
            <p className="reach-footer-line">{data.footerLines[1]}</p>
            <p className="reach-footer-line">{data.footerLines[2]}</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
