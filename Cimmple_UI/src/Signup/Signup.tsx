import * as React from "react";
import { Form, Button } from "react-bootstrap";
import { toast } from "react-toastify";
import { SignupService } from "../Common/Services/SignupService";
import "../Login/Login.scss";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const Signup: React.FC = () => {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [doneMessage, setDoneMessage] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!firstName.trim() || !lastName.trim() || !companyName.trim() || !email.trim()) {
      toast.error("All fields are required");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }

    setIsSubmitting(true);
    try {
      const message = await SignupService.register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        companyName: companyName.trim(),
        email: email.trim(),
      });
      setDoneMessage(message || "Thanks for signing up. Your login details will be emailed to you shortly.");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || error?.message || "We could not complete your signup. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-brand" aria-label="Cimmple brand">
        <div className="login-brand-top">
          <div className="login-brand-mark">
            <img src="/logo.svg" alt="" />
            <span>Cimmple</span>
          </div>
        </div>

        <div className="login-brand-copy">
          <h1>
            Try CimmpleFlow <em>free</em>
          </h1>
          <p>
            Start a free trial of the manufacturing ERP for machine shops. Your workspace comes ready
            with sample shop data, so you can look around right away.
          </p>
          <div className="login-brand-pills" aria-hidden="true">
            <span>Quoting</span>
            <span>Production</span>
            <span>Quality</span>
            <span>Inventory</span>
            <span>Accounting</span>
          </div>
        </div>

        <div className="login-brand-foot">
          <span>Built for CNC &amp; job shops</span>
          <a href="https://www.cimmple.com/" target="_blank" rel="noopener noreferrer">
            cimmple.com
          </a>
        </div>
      </aside>

      <main className="login-panel">
        <div className="login-panel-inner">
          {doneMessage ? (
            <>
              <div className="login-panel-header">
                <h2>Check your email</h2>
                <p>{doneMessage}</p>
              </div>
              <div className="login-footer-link">
                Already have your details? <a href="/login">Sign in</a>
              </div>
            </>
          ) : (
            <>
              <div className="login-panel-header">
                <h2>Start your free trial</h2>
                <p>Tell us a little about you and your company</p>
              </div>

              <Form className="login-form" onSubmit={handleSubmit} noValidate>
                <Form.Group className="mb-3">
                  <Form.Label>First name</Form.Label>
                  <Form.Control
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    maxLength={100}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Last name</Form.Label>
                  <Form.Control
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    maxLength={100}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Company name</Form.Label>
                  <Form.Control
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoComplete="organization"
                    maxLength={200}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Work email</Form.Label>
                  <Form.Control
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    maxLength={200}
                    required
                  />
                </Form.Group>

                <Button type="submit" className="w-100 login-submit" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Start free trial"}
                </Button>
              </Form>

              <div className="login-footer-link">
                Already have an account? <a href="/login">Sign in</a>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};
