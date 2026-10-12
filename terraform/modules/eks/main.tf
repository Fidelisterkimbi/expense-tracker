resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = var.cluster_role_arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = true
    public_access_cidrs     = var.public_access_cidrs
  }

  bootstrap_self_managed_addons = false

  access_config {
    authentication_mode = "API_AND_CONFIG_MAP"
  }

  tags = {
    Project = "expense-tracker"
  }
}

resource "aws_launch_template" "eks_workers" {
  name_prefix = "${var.cluster_name}-workers-"

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name    = "${var.cluster_name}-worker"
      Project = "expense-tracker"
    }
  }
}

resource "aws_eks_node_group" "workers" {
  depends_on = [
    aws_eks_addon.vpc_cni
  ]

  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "${var.cluster_name}-workers"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.subnet_ids

  instance_types = var.node_instance_types
  capacity_type  = "ON_DEMAND"

  launch_template {
    id      = aws_launch_template.eks_workers.id
    version = aws_launch_template.eks_workers.latest_version
  }

  scaling_config {
    desired_size = var.desired_nodes
    min_size     = var.min_nodes
    max_size     = var.max_nodes
  }

  update_config {
    max_unavailable = 1
  }

  tags = {
    Project = "expense-tracker"
  }
}
