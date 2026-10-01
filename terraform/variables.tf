variable "aws_region" {
  description = "AWS region for the Expense Tracker"
  type        = string
  default     = "us-east-1"
}

variable "vpc_id" {
  description = "Existing AWS VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "Existing public subnet ID"
  type        = string
}

variable "ssh_cidr" {
  description = "IP address allowed to SSH into the EC2 server"
  type        = string
}

variable "key_name" {
  description = "Existing AWS EC2 key pair name"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}
