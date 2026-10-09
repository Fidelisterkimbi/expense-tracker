data "aws_vpc" "existing" {
  id = var.vpc_id
}

data "aws_subnet" "az_a" {
  id = var.subnet_a_id
}

data "aws_subnet" "az_b" {
  id = var.subnet_b_id
}
