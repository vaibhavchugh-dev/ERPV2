import React from "react";
import { Navbar, Nav, Container } from "react-bootstrap";
import { useHistory } from "react-router-dom";
import { User } from "../Services/User";

const Header: React.FC = () => {
  const history = useHistory();
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  const userName = storage?.userName || "User";

  const handleLogout = () => {
    localStorage.clear();
    User.isAuthenticated = false;
    history.push("/login");
  };

  return (
    <Navbar bg="dark" variant="dark" fixed="top" expand="lg">
      <Container fluid>
        <Navbar.Brand href="#home">Cimmple ERP</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="mr-auto">
            <Nav.Link onClick={() => history.push("/home")}>Dashboard</Nav.Link>
            <Nav.Link onClick={() => history.push("/masters/customer")}>Customer Master</Nav.Link>
          </Nav>
          <Nav className="ml-auto">
            <Navbar.Text className="mr-3">Welcome, {userName}</Navbar.Text>
            <Nav.Link onClick={handleLogout}>Logout</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header;
