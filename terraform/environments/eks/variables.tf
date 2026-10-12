variable "vpc_id" {
  type    = string
  default = "vpc-08ee2cf0c8c116f20"
}

variable "subnet_a_id" {
  type    = string
  default = "subnet-0ddb471e4767bb065"
}

variable "subnet_b_id" {
  type    = string
  default = "subnet-0c244755871c2f8be"
}

variable "cluster_name" {
  type    = string
  default = "expense-tracker-eks"
}

variable "eks_api_allowed_cidrs" {
  description = "Public IP CIDRs permitted to access the EKS API"
  type        = list(string)
}
