# ==========================================
# Ubuntu 24.04 AMI
# ==========================================

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name = "name"

    values = [
      "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
    ]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}


# ==========================================
# Expense Tracker Security Group
# ==========================================

resource "aws_security_group" "expense_tracker" {
  name        = "expense-tracker-sg"
  description = "Security group for Expense Tracker"
  vpc_id      = var.vpc_id

  tags = {
    Name    = "expense-tracker-sg"
    Project = "expense-tracker"
  }
}


# ==========================================
# SSH - only from administrator IP
# ==========================================

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.expense_tracker.id

  description = "SSH administrator access"

  cidr_ipv4   = var.ssh_cidr
  from_port   = 22
  to_port     = 22
  ip_protocol = "tcp"
}


# ==========================================
# HTTP - public access
# ==========================================

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.expense_tracker.id

  description = "Public HTTP access"

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 80
  to_port     = 80
  ip_protocol = "tcp"
}


# ==========================================
# HTTPS - public access
# ==========================================

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.expense_tracker.id

  description = "Public HTTPS access"

  cidr_ipv4   = "0.0.0.0/0"
  from_port   = 443
  to_port     = 443
  ip_protocol = "tcp"
}


# ==========================================
# Outbound Internet Access
# ==========================================

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.expense_tracker.id

  cidr_ipv4   = "0.0.0.0/0"
  ip_protocol = "-1"
}


# ==========================================
# Expense Tracker EC2 Instance
# ==========================================

resource "aws_instance" "expense_tracker" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  subnet_id = var.subnet_id
  key_name  = var.key_name

  vpc_security_group_ids = [
    aws_security_group.expense_tracker.id
  ]

  associate_public_ip_address = true

  root_block_device {
    volume_type = "gp3"
    volume_size = 10
    encrypted   = true
  }

  tags = {
    Name    = "expense-tracker-server"
    Project = "expense-tracker"
  }
}
