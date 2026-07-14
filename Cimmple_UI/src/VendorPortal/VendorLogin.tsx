import React, { useState } from "react";
import { Container, Row, Col, Card, Form, Button, Spinner } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import "./VendorPortal.scss";

export const VendorLogin: React.FC = () => {
  const history = useHistory();
  const [vendorCode, setVendorCode] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // For now, use vendor code as authentication
      // In production, this should call a vendor authentication API
      if (!vendorCode) {
        toast.error("Vendor code is required");
        return;
      }

      // Store vendor session
      localStorage.setItem("vendorToken", "vendor-auth-token");
      localStorage.setItem("vendorStorage", JSON.stringify({
        vendorCode: vendorCode,
        isVendor: true
      }));
      
      toast.success("Login successful!");
      history.push("/vendor/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Login failed");
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
                <Button variant="primary" type="submit" className="w-100" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Spinner animation="border" size="sm" className="mr-2" />
                      Logging in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </Form>
              <div className="text-center mt-3">
                <small className="text-muted">
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

