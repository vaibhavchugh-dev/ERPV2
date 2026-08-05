import * as React from "react";
import { Container, Row, Col, Card, Form, Button } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { User } from "../Common/Services/User";
import { AuthService } from "../Common/Services/AuthService";
import { toast } from "react-toastify";

export const Login: React.FC = () => {
  const history = useHistory();
  const [userName, setUserName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [showTenant, setShowTenant] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    User.UnderMaintenance().then((result: any) => {
      if (result?.message === "success" && result?.result === 1) {
        window.location.href = window.location.origin + "/Under-Maintenance";
      }
    });

    if (localStorage.getItem("logOutFromIdlePopUp")) {
      localStorage.removeItem("logOutFromIdlePopUp");
      setIdleLogOutMessage("You have been logged out due to inactivity");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!userNameVal || !userPwd) {
      setErrorMessage("Username and password are required");
      return;
    }

    setLoginButtonSpinner(true);

    try {
      const parsedTenant = tenantId ? parseInt(tenantId, 10) : undefined;
      const response = await AuthService.login(
        userName.trim(),
        password,
        parsedTenant && !isNaN(parsedTenant) ? parsedTenant : undefined
      );

      User.isAuthenticated = true;
      User.apiLoginResponse = response;

      if (response.user.mustChangePassword) {
        toast.info("Please change your password");
        history.push("/change-password");
        return;
      }

      toast.success("Login successful!");
      history.push("/home");
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Login failed";
      if (typeof message === "string" && message.toLowerCase().includes("tenant")) {
        setShowTenant(true);
      }
      toast.error(message);
    } finally {
      setChangePasswordSpinner(false);
    }
  };

  if (isValidateLogin) {
    console.log("***********");
    return <Redirect to="/home" />;
  }

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
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <Form.Control
                    type="text"
                    name="userNameVal"
                    value={userNameVal}
                    placeholder="Enter username"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    autoComplete="username"
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
                    autoComplete="current-password"
                    required
                  />
                </Form.Group>
                {(showTenant || tenantId) && (
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant ID</Form.Label>
                    <Form.Control
                      type="number"
                      placeholder="Required if username exists in multiple tenants"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                    />
                  </Form.Group>
                )}
                <Button variant="primary" type="submit" className="w-100" disabled={isLoading}>
                  {isLoading ? "Signing in..." : "Sign In"}
                </Button>
                {errorMessage && (
                  <span className="text-danger d-block mt-2 text-center">{errorMessage}</span>
                )}
                {idleLogOutMessage && (
                  <span className="text-danger d-block mt-2 text-center">{idleLogOutMessage}</span>
                )}
              </Form>
              <div className="text-center mt-3">
                <small className="text-muted">
                  <a href="/vendor/login">Vendor portal</a>
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Modal show={changepasswordpopupshow} onHide={() => setChangepasswordpopupshow(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Change Password Required</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted">Please change your temporary password to continue.</p>
          <Form onSubmit={handleChangePasswordSubmit}>
            <Form.Group className="mb-3">
              <Form.Label className="font-semibold">New Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Enter new password"
                value={changepassword}
                onChange={(e) => setChangepassword(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="font-semibold">Confirm New Password</Form.Label>
              <Form.Control
                type="password"
                placeholder="Confirm new password"
                value={confirmchangepassword}
                onChange={(e) => setConfirmchangepassword(e.target.value)}
              />
            </Form.Group>
            {changePasswordError && (
              <span className="text-danger d-block mb-3 text-center">{changePasswordError}</span>
            )}
            <div className="d-flex justify-content-end gap-2">
              <Button variant="secondary" className="me-2" onClick={() => setChangepasswordpopupshow(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={changePasswordSpinner || !changepassword || changepassword !== confirmchangepassword}>
                {changePasswordSpinner ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Updating...
                  </>
                ) : (
                  "Change Password"
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </Container>
  );
};
