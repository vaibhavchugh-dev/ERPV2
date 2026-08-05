import * as React from "react";
import { Container, Row, Col, Card, Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { AuthService } from "../Common/Services/AuthService";
import { User } from "../Common/Services/User";

export const ChangePassword: React.FC = () => {
  const history = useHistory();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setIsLoading(true);
    try {
      await AuthService.changePassword(currentPassword, newPassword);
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      storage.mustChangePassword = false;
      localStorage.setItem("storage", JSON.stringify(storage));
      toast.success("Password updated");
      history.push("/home");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to change password");
    } finally {
      setIsLoading(false);
    }
  };

  if (!User.isAuthenticated && !localStorage.getItem("token")) {
    history.push("/login");
    return null;
  }

  return (
    <Container fluid className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh", backgroundColor: "#f5f5f5" }}>
      <Row className="w-100">
        <Col md={4} className="mx-auto">
          <Card>
            <Card.Body>
              <Card.Title className="text-center mb-4">
                <h2>Change Password</h2>
                <p className="text-muted">Update your password to continue</p>
              </Card.Title>
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Current password</Form.Label>
                  <Form.Control
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>New password</Form.Label>
                  <Form.Control
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Confirm new password</Form.Label>
                  <Form.Control
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100" disabled={isLoading}>
                  {isLoading ? "Updating password..." : "Update password"}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};
