output "vpc_id" {
  value = data.aws_vpc.existing.id
}

output "subnet_ids" {
  value = [
    data.aws_subnet.az_a.id,
    data.aws_subnet.az_b.id
  ]
}

output "availability_zones" {
  value = [
    data.aws_subnet.az_a.availability_zone,
    data.aws_subnet.az_b.availability_zone
  ]
}
