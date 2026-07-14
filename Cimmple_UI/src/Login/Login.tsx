import * as React from "react";
import { Container, Row, Col, Card, Form, Button, Spinner } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { User } from "../Common/Services/User";
import { toast } from "react-toastify";

export const Login: React.FC = () => {
  const history = useHistory();
  const [userName, setUserName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // TODO: Implement actual login logic with backend API
      // For now, just set a mock token to allow navigation
      localStorage.setItem("token", "mock-token");
      localStorage.setItem("storage", JSON.stringify({
        userName: userName || "Demo User",
        tenantID: 1,
        rolId: 1,
        userId: 1,
        user_UniqueID: "1"
      }));
      
      User.isAuthenticated = true;
      toast.success("Login successful!");
      history.push("/home");
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container fluid className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh", backgroundColor: "#f5f5f5" }}>
      <Row className="w-100">
        <Col md={4} className="mx-auto">
          <Card>
            <Card.Body>
              <Card.Title className="text-center mb-4">
                <h2>Cimmple ERP</h2>
                <p className="text-muted">Sign in to your account</p>
              </Card.Title>
              <Form onSubmit={handleLogin}>
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Enter username"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
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
                  Note: Backend API integration pending. Any username/password will work for now.
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
