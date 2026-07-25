import * as React from "react";
import { Container, Row, Col, Card, Form, Button, Spinner, Modal } from "react-bootstrap";
import { Redirect } from "react-router-dom";
import { User } from "../Common/Services/User";
import { IUser } from "../Common/Contracts/IUser";
import { toast } from "react-toastify";

export const Login: React.FC = () => {
  const [userNameVal, setUserNameVal] = React.useState("");
  const [userPwd, setUserPwd] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState("");
  const [loginButtonSpinner, setLoginButtonSpinner] = React.useState(false);
  const [isValidateLogin, setIsValidateLogin] = React.useState(false);
  const [changepasswordpopupshow, setChangepasswordpopupshow] = React.useState(false);
  const [changepassword, setChangepassword] = React.useState("");
  const [confirmchangepassword, setConfirmchangepassword] = React.useState("");
  const [loggedInUserName, setLoggedInUserName] = React.useState("");
  const [idleLogOutMessage, setIdleLogOutMessage] = React.useState("");
  const [changePasswordError, setChangePasswordError] = React.useState("");
  const [changePasswordSpinner, setChangePasswordSpinner] = React.useState(false);

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
      const result: IUser | null = await User.loginNew(
        userNameVal,
        userPwd,
        "LoginPage"
      );
      if (!User.apiLoginResponse?.success || !result) {
        setErrorMessage("Please enter the valid username/password.");
        setLoginButtonSpinner(false);
        return;
      }

      if (result.user_UniqueID === 0) {
        setErrorMessage("Please enter the valid username/password.");
        setLoginButtonSpinner(false);
        return;
      }

      if (result.pwdChangeStatus === "req") {
        setLoggedInUserName(result.userName);
        setChangepasswordpopupshow(true);
        setLoginButtonSpinner(false);
        return;
      }

      if (result.message === "success") {
        await User.ValidateUserStatus(result.userName, result.tenantID, "loginModal");
        setIsValidateLogin(true);
        setLoginButtonSpinner(false);
      } else {
        setErrorMessage(result.message || "Login failed");
        setLoginButtonSpinner(false);
      }
    } catch (error: any) {
      setLoginButtonSpinner(false);
      toast.error(`Server Error: ${error?.message || error}`, {
        position: toast.POSITION.BOTTOM_RIGHT,
        containerId: "Login",
      });
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError("");

    if (!changepassword || !confirmchangepassword) {
      setChangePasswordError("Both password fields are required.");
      return;
    }

    if (changepassword !== confirmchangepassword) {
      setChangePasswordError("Passwords do not match.");
      return;
    }

    setChangePasswordSpinner(true);
    try {
      const userObj = User.apiLoginResponse?.user;
      const userId = userObj?.user_UniqueID || userObj?.tenantID || 0;
      const res = await User.ChangeOldPassword(loggedInUserName || userNameVal, changepassword, userId);

      if (res?.message === "success" || res?.status === true || res?.success === true) {
        toast.success("Password changed successfully! Logging in...", {
          position: toast.POSITION.BOTTOM_RIGHT,
          containerId: "Login",
        });
        setChangepasswordpopupshow(false);
        if (userObj) {
          await User.ValidateUserStatus(userObj.userName, userObj.tenantID, "loginModal");
          setIsValidateLogin(true);
        }
      } else {
        setChangePasswordError(res?.message || "Failed to change password.");
      }
    } catch (err: any) {
      setChangePasswordError(err?.message || "Error updating password.");
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
                    onChange={(e) => {
                      setUserNameVal(e.target.value);
                      setErrorMessage("");
                    }}
                    className="form-control inp_text"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="password"
                    name="userPwd"
                    value={userPwd}
                    placeholder="Enter Password"
                    onChange={(e) => setUserPwd(e.target.value)}
                    className="form-control inp_text"
                  />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100" disabled={loginButtonSpinner}>
                  {loginButtonSpinner ? (
                    <>
                      <Spinner animation="border" size="sm" className="mr-2" />
                      Logging in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
                {errorMessage && (
                  <span className="text-danger d-block mt-2 text-center">{errorMessage}</span>
                )}
                {idleLogOutMessage && (
                  <span className="text-danger d-block mt-2 text-center">{idleLogOutMessage}</span>
                )}
              </Form>
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
