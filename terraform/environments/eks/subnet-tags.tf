resource "aws_ec2_tag" "public_subnet_a" {
  resource_id = var.subnet_a_id
  key         = "kubernetes.io/role/elb"
  value       = "1"
}

resource "aws_ec2_tag" "public_subnet_b" {
  resource_id = var.subnet_b_id
  key         = "kubernetes.io/role/elb"
  value       = "1"
}
