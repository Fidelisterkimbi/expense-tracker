variable "cluster_name" {
  type = string
}

variable "cluster_role_arn" {
  type = string
}

variable "node_role_arn" {
  type = string
}

variable "subnet_ids" {
  type = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "EKS requires at least two subnet IDs."
  }
}

variable "node_instance_types" {
  type    = list(string)
  default = ["c7i-flex.large"]
}

variable "desired_nodes" {
  type    = number
  default = 2
}

variable "min_nodes" {
  type    = number
  default = 2
}

variable "max_nodes" {
  type    = number
  default = 4
}

variable "public_access_cidrs" {
  description = "Allowed CIDR ranges for public EKS API access"
  type        = list(string)

  validation {
    condition = (
      length(var.public_access_cidrs) > 0 &&
      alltrue([
        for cidr in var.public_access_cidrs :
        can(cidrhost(cidr, 0)) && cidr != "0.0.0.0/0" && cidr != "::/0"
      ])
    )
    error_message = "Provide restricted CIDR ranges, not unrestricted internet access."
  }
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.36"
}

variable "ebs_csi_role_arn" {
  description = "IAM role ARN for the EBS CSI driver"
  type        = string
}
