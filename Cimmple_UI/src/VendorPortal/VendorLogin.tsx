import React, { useState } from "react";
import { Container, Row, Col, Card, Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService } from "../Common/Services/AuthService";
import "./VendorPortal.scss";

export const VendorLogin: React.FC = () => {
  const history = useHistory();
  const [vendorCode, setVendorCode] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (!vendorCode) {
        toast.error("Vendor code is required");
        return;
      }

      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      await AuthService.vendorLogin(
        vendorCode.trim(),
        password,
        parsedTenant && !isNaN(parsedTenant) ? parsedTenant : undefined
      );

      toast.success("Login successful!");
      history.push("/vendor/dashboard");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container fluid className="vendor-login-container">
      <Row className="w-100">
        <Col md={4} className="mx-auto">
          <Card className="vendor-login-card">
            <Card.Body>
              <Card.Title className="text-center mb-4">
                <h2>Vendor Portal</h2>
                <p className="text-muted">Sign in to view and respond to quotations</p>
              </Card.Title>
              <Form onSubmit={handleLogin}>
                <Form.Group className="mb-3">
                  <Form.Label>Vendor Code</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter your vendor code"
                    value={vendorCode}
                    onChange={(e) => setVendorCode(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Tenant ID (optional)</Form.Label>
                  <Form.Control
                    type="number"
                    placeholder="Only if required"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                  />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100" disabled={isLoading}>
                  {isLoading ? "Logging in..." : "Sign In"}
                </Button>
              </Form>
              <div className="text-center mt-3">
                <small className="text-muted">
                  Sign in with your vendor code and portal password.{" "}
                  <a href="/login" style={{ color: "#6366f1" }}>Back to Main Portal</a>
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
