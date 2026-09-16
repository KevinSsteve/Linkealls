import brandLogo from "@assets/1000379740_1788938201385.png";

export function AuthBrand() {
  return (
    <div className="auth-brand" data-testid="auth-brand">
      <img className="auth-brand-logo" src={brandLogo} alt="Linkealls" />
      <span>linkealls</span>
    </div>
  );
}